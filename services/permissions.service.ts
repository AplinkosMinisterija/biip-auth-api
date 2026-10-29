'use strict';

import { isEmpty } from 'lodash';
import moleculer, { Context, GenericObject } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';
import DbConnection from '../mixins/database.mixin';
import {
  BaseModelInterface,
  COMMON_DEFAULT_SCOPES,
  COMMON_FIELDS,
  COMMON_SCOPES,
  DISABLE_REST_ACTIONS,
  EndpointType,
  PERMISSION_WILDCARD,
  PermissionGrantErrorType,
  throwBadRequestError,
  throwForbiddenError,
  throwNotFoundError,
  throwUnauthorizedError,
} from '../types';
import { AppAuthMeta, UserAuthMeta } from './api.service';
import { App, AppType, UsersAppAccesses } from './apps.service';
import { Group } from './groups.service';
import { UserGroup, UserGroupRole } from './userGroups.service';
import { User, UserType } from './users.service';

export enum PermissionRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum PermissionAction {
  ASSIGN = 'assign',
  UNASSIGN = 'unassign',
}

export interface Permission extends BaseModelInterface {
  user: number | User;
  group: number | Group;
  app: number | App;
  role: PermissionRole;
  accesses?: Array<string>;
  features?: Array<string>;
  municipalities?: Array<number>;
}

enum PermissionTypeEnum {
  ACCESSES = 'accesses',
  FEATURES = 'features',
}
interface PermissionType {
  [PermissionTypeEnum.ACCESSES]: Array<string>;
  [PermissionTypeEnum.FEATURES]: Array<string>;
}

@Service({
  name: 'permissions',

  mixins: [
    DbConnection({
      collection: 'permissions',
      cacheCleanEvents: ['permissions.*', 'userGroups.*', 'groups.*', 'users.*'],
    }),
  ],

  settings: {
    fields: {
      id: {
        type: 'number',
        columnType: 'integer',
        primaryKey: true,
        secure: true,
      },

      user: {
        type: 'number',
        columnType: 'integer',
        columnName: 'userId',
        populate: 'users.resolve',
      },

      group: {
        type: 'number',
        columnType: 'integer',
        columnName: 'groupId',
        populate: 'groups.resolve',
      },

      app: {
        type: 'number',
        columnType: 'integer',
        columnName: 'appId',
        populate: 'apps.resolve',
      },

      role: {
        type: 'enum',
        values: Object.values(PermissionRole),
      },

      accesses: {
        type: 'array',
        items: 'string',
      },

      features: {
        type: 'array',
        items: 'string',
      },

      municipalities: {
        type: 'array',
        items: 'number',
      },

      ...COMMON_FIELDS,
    },

    scopes: {
      ...COMMON_SCOPES,
    },

    defaultScopes: [...COMMON_DEFAULT_SCOPES],
  },

  events: {
    async 'groups.removed'(ctx: Context<{ data: { id: number } }, UserAuthMeta>) {
      const { id } = ctx.params.data;
      this.removeEntities(ctx, { query: { group: id } }, { meta: ctx.meta });
    },
    async 'users.removed'(ctx: Context<{ data: { id: number } }, UserAuthMeta>) {
      const { id } = ctx.params.data;
      this.removeEntities(ctx, { query: { user: id } }, { meta: ctx.meta });
    },
  },

  actions: {
    ...DISABLE_REST_ACTIONS,
    // The @moleculer/database mixin exposes get/list/create/update/remove over
    // REST by default. Permissions are the authorization source of truth, so the
    // raw CRUD surface must NOT be reachable by ordinary users: an authenticated
    // USER could otherwise `PATCH /api/permissions/:id {accesses:["*"]}` to grant
    // themselves anything (privilege escalation), or enumerate every permission
    // via `GET /api/permissions`. NOTE: under the gateway's `mappingPolicy: 'all'`,
    // `rest: null` is NOT sufficient — an action with no alias is still reachable
    // by name (e.g. `POST /api/permissions/create`), so every mutating action MUST
    // also be `types`-gated. Mutations go through the explicit, ADMIN-typed
    // `findOrCreate` / `modifyAccessForGroup` actions; internal broker calls (e.g.
    // from findUsersByAccess) bypass the gateway `authorize()` and keep working.
    create: {
      rest: null,
      types: [EndpointType.SUPER_ADMIN],
    },
    update: {
      rest: null,
      types: [EndpointType.SUPER_ADMIN],
    },
    remove: {
      rest: null,
      types: [EndpointType.SUPER_ADMIN],
    },
    get: {
      types: [EndpointType.ADMIN, EndpointType.SUPER_ADMIN],
    },
    list: {
      types: [EndpointType.ADMIN, EndpointType.SUPER_ADMIN],
    },
  },

  hooks: {
    before: {
      list: 'assignPermissionsFilters',
    },
  },
})
export default class PermissionsService extends moleculer.Service {
  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getUserPermissions(ctx: Context<{ id: number }>) {
    const { id } = ctx.params;
    const user: User = await ctx.call('users.resolve', { id });

    if (!user) return;

    const appsIds: Array<number> = await ctx.call('inheritedUserApps.getAppsByUser', {
      user: user.id,
    });

    const isSuperAdmin = user.type === UserType.SUPER_ADMIN;

    const apps: Array<App> = await this.broker.call('apps.resolve', {
      id: appsIds,
    });

    const userGroups: Array<UserGroup> = await this.getUserGroups(user.id);

    const isAdminInGroups = userGroups.some((g: UserGroup) => g.role === UserGroupRole.ADMIN);

    if (isAdminInGroups || isSuperAdmin) {
      const usersApp: App = await this.broker.call('apps.getUsersApp');
      apps.push(usersApp);
    }

    const result = await apps.reduce(async (promisedAcc: any, a: any) => {
      const acc = await promisedAcc;
      acc[a.type] = await this.getPermissionsByAppAndUser(a, user);
      return acc;
    }, Promise.resolve({}));

    return result;
  }

  @Action({
    rest: 'GET /users',
    auth: EndpointType.PUBLIC,
    params: {
      access: 'string',
      municipality: {
        type: 'number',
        convert: true,
        optional: true,
      },
    },
  })
  async findUsersByAccess(
    ctx: Context<{ access: string; municipality: number }, AppAuthMeta>,
  ) {
    const { access, municipality } = ctx.params;
    const app = ctx.meta.app;

    const query: GenericObject = {
      accesses: {
        $exists: true,
      },
      $raw: {
        condition: `"accesses" @> ?::jsonb`,
        bindings: [JSON.stringify([access])],
      },
    };

    // PII guard: this endpoint is API-key only (no user). Scope the lookup to the
    // calling app so one app's key cannot enumerate users (email/name) across the
    // whole BIIP estate. ADMIN-type apps legitimately span apps, so they keep the
    // cross-app view. Fail CLOSED if there is no app context (should be
    // unreachable — verifyApiKey 401s first — but never return unscoped PII).
    if (!app) {
      throwUnauthorizedError('No application context.');
    }
    if (app.type !== AppType.ADMIN) {
      query.app = app.id;
    }

    const parentCtx: any = {};
    const permissions: Array<Permission> = await ctx.call('permissions.find', {
      query,
    });

    // A permission belongs to ONE app, but a group spans several: `GGAD` carries
    // both a Medziokle and a Zuvinimas permission, while `user_groups.role` is a
    // single role for the whole group. Expanding the group therefore yields
    // people who have nothing to do with `p.app` — in production that mailed
    // every national hunting incident to a fish-stocking-only account for five
    // weeks (issue #57). The `query.app` guard above scopes the PERMISSION row;
    // the PEOPLE it resolves to need the same scope, or the app boundary only
    // holds for whoever asks, not for whoever is returned.
    const userLists: Array<Array<number>> = await Promise.all(
      permissions.map(async (p) => {
        let ids: Array<any> = [];

        if (p.user) {
          ids = [p.user];
        } else if (p.group) {
          ids = await ctx.call(
            'userGroups.usersIdsInGroupRecursively',
            { id: p.group, role: p.role },
            { parentCtx },
          );
        }

        if (!ids.length || !p.app) return ids.map(Number);

        // `inheritedUserApps` already resolves the whole precedence chain:
        // SUPER_ADMIN holds every app, an explicit `users.apps_ids` overrides
        // the group's, and an empty one inherits it (inherited_user_apps view).
        return ctx.call(
          'inheritedUserApps.getUserIdsByApp',
          { app: p.app, users: ids.map(Number) },
          { parentCtx },
        );
      }),
    );

    const userList: Array<number> = userLists.reduce(
      (acc: Array<number>, item) => [...acc, ...item],
      [],
    );

    let users: Array<any> = await ctx.call(
      'users.find',
      {
        query: {
          id: {
            $in: userList,
          },
        },
        populate: 'municipalities',
      },
      { parentCtx },
    );

    if (municipality) {
      users = users.filter((u) => u.municipalities.includes(Number(municipality)) || false);
    }

    return {
      rows: users,
      total: users.length,
    };
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
    cache: {
      keys: ['id'],
    },
  })
  async getUserMunicipalities(ctx: Context<{ id: number }>) {
    return this.computeUserMunicipalities(ctx, ctx.params.id);
  }

  // Uncached, for decisions to grant; the action above caches it for everyone else.
  @Method
  async computeUserMunicipalities(ctx: Context, id: number) {
    const user: User = await ctx.call('users.resolve', { id });

    if (!user) return;

    if (await this.managesAllMunicipalities(user.id)) {
      // all municipalities for super admin
      const municipalities: any = await ctx.call('permissions.listMunicipalities');
      return municipalities.rows.map((r: any) => r.id);
    }

    const userGroups: Array<UserGroup> = await this.getUserGroups(user.id, ['permissions']);

    if (!userGroups || !userGroups.length) return [];

    const groups: Array<Group> = userGroups.map((g) => g.groupWithParents).filter((i) => i);

    if (!groups || !groups.length) return [];

    const collectMunicipalitiesRecursively = (group: Group, municipalities: Array<number> = []) => {
      if (group.permissions && group.permissions.length) {
        group.permissions.map((groupPermission) => {
          if (!groupPermission.municipalities || !groupPermission.municipalities.length) return;

          municipalities = [...municipalities, ...groupPermission.municipalities];
        });
      }

      if (group?.parent && !municipalities.length) {
        municipalities = collectMunicipalitiesRecursively(group.parent as Group, municipalities);
      }

      return municipalities;
    };

    return groups
      .map((g) => collectMunicipalitiesRecursively(g))
      .reduce((acc: Array<number>, item) => {
        return [...acc, ...item];
      }, []);
  }

  @Action({
    rest: 'POST /',
    types: [EndpointType.ADMIN, EndpointType.SUPER_ADMIN],
    params: {
      user: {
        type: 'number',
        convert: true,
        optional: true,
      },
      app: {
        type: 'number',
        convert: true,
      },
      group: {
        type: 'number',
        convert: true,
        optional: true,
      },
      accesses: {
        type: 'array',
        items: 'string',
        optional: true,
      },
      features: {
        type: 'array',
        items: 'string',
        optional: true,
      },
      role: {
        type: 'string',
        optional: true,
        enum: Object.values(PermissionRole),
      },
    },
  })
  async findOrCreate(
    ctx: Context<
      {
        user: number;
        group: number;
        app: number;
        role: string;
        accesses: Array<string>;
        features: Array<string>;
      },
      AppAuthMeta & UserAuthMeta
    >,
  ) {
    const { user, group, app, role, accesses, features } = ctx.params;

    const query: any = {
      app,
    };

    if (!user && !group) {
      throwBadRequestError('Group or/and user should be passed.');
    }

    const isRestricted = this.isRestrictedGranter(ctx.meta.user);

    if (isRestricted && user) {
      throwForbiddenError(
        'Only a super admin can set user-level permissions.',
        PermissionGrantErrorType.USER_LEVEL,
      );
    }

    if (user) query.user = user;
    if (group) query.group = group;
    if (role) query.role = role;

    // A restricted caller changes exactly the group row he names: never a user-level row that
    // shares the group, nor a row of another role.
    if (isRestricted) {
      query.user = { $exists: false };
      query.role = role || { $exists: false };
    }

    const permission: Permission = await ctx.call('permissions.findOne', {
      query,
    });

    if (isRestricted) {
      await this.assertCanEditGroup(ctx, group);
      await this.assertHoldsApp(ctx.meta.user, app);
      // An omitted features list leaves an existing row's features as they are; a new row
      // gets an empty list, which reads as all features.
      const changedFeatures = features ?? (permission?.id ? undefined : []);
      await this.assertGrantWithinOwn(ctx.meta.user, app, {
        accesses,
        features: changedFeatures,
      });
    }

    const data = {
      app,
      ...(user && { user }),
      ...(group && { group }),
      ...(role && { role }),
      accesses,
      features,
    };
    if (permission && permission.id) {
      return ctx.call('permissions.update', {
        id: permission.id,
        ...data,
      });
    }

    return ctx.call('permissions.create', data);
  }

  @Action({
    rest: 'POST /modifyAccessForGroup',
    types: [EndpointType.ADMIN, EndpointType.SUPER_ADMIN],
    params: {
      access: { type: 'string' },
      group: { type: 'number', convert: true },
      app: { type: 'number', convert: true, optional: true },
      action: { type: 'enum', values: Object.values(PermissionAction) },
    },
  })
  async modifyAccessForGroup(
    ctx: Context<
      {
        group: number;
        app: number;
        access: string;
        action: PermissionAction;
      },
      AppAuthMeta & UserAuthMeta
    >,
  ) {
    const { group, app, access, action } = ctx.params;
    const currentApp = ctx?.meta?.app;
    const canUseCustomAppId = Object.values(AppType).includes(currentApp?.type);

    const appId = canUseCustomAppId ? app ?? currentApp?.id : currentApp?.id;

    if (!appId) {
      throwBadRequestError('App ID is missing or invalid.');
    }

    const isRestricted = this.isRestrictedGranter(ctx.meta.user);

    // No exception for a module's own companies: an admin may join a company afterwards
    // (user editing lets him), so an access he could hand a company he could hand himself.
    // A SUPER_ADMIN still assigns anything, e.g. a fishing company's INVESTIGATOR access.
    if (isRestricted) {
      await this.assertCanEditGroup(ctx, group);
      await this.assertHoldsApp(ctx.meta.user, appId);
      if (action === PermissionAction.ASSIGN) {
        await this.assertGrantWithinOwn(ctx.meta.user, appId, { accesses: [access] });
      }
    }

    const permission: Permission = await ctx.call('permissions.findOne', {
      query: {
        group,
        app: appId,
        ...(isRestricted && { user: { $exists: false }, role: { $exists: false } }),
      },
    });

    if (action === PermissionAction.ASSIGN) {
      if (permission?.id) {
        const existingAccesses = Array.isArray(permission.accesses) ? permission.accesses : [];

        const updatedAccesses = existingAccesses.includes(access)
          ? existingAccesses
          : [...existingAccesses, access];

        return ctx.call('permissions.update', {
          id: permission.id,
          accesses: updatedAccesses,
        });
      }

      return ctx.call('permissions.create', {
        group,
        app: appId,
        accesses: [access],
      });
    }

    if (action === PermissionAction.UNASSIGN) {
      if (!permission?.id) {
        throwBadRequestError('Permission not found for this group.');
      }

      const updatedAccesses = permission.accesses.filter((a) => a !== access);

      return ctx.call('permissions.update', {
        id: permission.id,
        accesses: updatedAccesses,
      });
    }

    throwBadRequestError('Invalid action. Must be either assign or unassign.');
  }

  @Action({
    params: {
      userId: {
        type: 'number',
        convert: true,
        optional: true,
      },
      appId: {
        type: 'number',
        convert: true,
        optional: true,
      },
      edit: {
        type: 'boolean',
        optional: true,
        default: false,
      },
    },
    // cache: {
    //   keys: ['userId', 'appId', 'edit'],
    // },
  })
  async getVisibleUsersIds(
    ctx: Context<
      { userId: number; appId: number; edit: boolean; group: number | GenericObject },
      UserAuthMeta & AppAuthMeta
    >,
  ) {
    let app: App = ctx.meta.app;
    let user: User = ctx.meta.user;
    const group = ctx?.params?.group;

    if (ctx.params.appId) {
      app = await ctx.call('apps.resolve', { id: ctx.params.appId });
    }
    if (ctx.params.userId) {
      user = await ctx.call('users.resolve', { id: ctx.params.userId });
    }

    const edit = ctx.params.edit || false;

    if (!app || !user) {
      throwNotFoundError('App not found');
    }

    const usersIdsInGroup: Array<any> = await this.getVisibleUsersIdsByUser(user, group, edit);

    if (isEmpty(usersIdsInGroup)) {
      if (!!group || user.type !== UserType.SUPER_ADMIN) {
        return [];
      }
    }

    const visibleUsersInGroupsWithApp: Array<number> = await ctx.call(
      'inheritedUserApps.getUserIdsByApp',
      {
        app: app.id,
        users: usersIdsInGroup,
      },
    );

    if (user.type === UserType.ADMIN) {
      const adminVisibleUserIds: Array<number> = await ctx.call(
        'inheritedUserApps.getUserIdsByApp',
        {
          app: app.id,
          type: UserType.USER,
        },
      );

      return [...adminVisibleUserIds, ...visibleUsersInGroupsWithApp];
    }

    return visibleUsersInGroupsWithApp;
  }

  @Action({
    params: {
      userId: {
        type: 'number',
        convert: true,
        optional: true,
      },
      appId: {
        type: 'number',
        convert: true,
        optional: true,
      },
      edit: {
        type: 'boolean',
        optional: true,
        default: false,
      },
    },
  })
  async getVisibleGroupsIds(
    ctx: Context<{ userId?: number; appId: number; edit: boolean }, UserAuthMeta & AppAuthMeta>,
  ) {
    let app: App = ctx.meta.app;
    let user: User = ctx.meta.user;

    if (ctx.params.appId) {
      app = await ctx.call('apps.resolve', { id: ctx.params.appId });
    }
    if (ctx.params.userId) {
      user = await ctx.call('users.resolve', { id: ctx.params.userId });
    }

    const edit = ctx.params.edit || false;

    if (!app) {
      throwNotFoundError('App not found');
    }

    if (!user || user.type === UserType.SUPER_ADMIN) {
      return ctx.call('inheritedGroupApps.getGroupIdsByApp', {
        app: app.id,
      });
    }

    let userGroupsIds: Array<any> = await this.getVisibleGroupsByUser(
      user.id,
      edit && UserGroupRole.ADMIN,
    );

    if (user.type === UserType.ADMIN) {
      const companyIds: Array<number> = await this.getCompanyIdsByApp(app.id);
      userGroupsIds = [...userGroupsIds, ...companyIds];
    }

    if (!userGroupsIds?.length) return [];

    return ctx.call('inheritedGroupApps.getGroupIdsByApp', {
      groups: userGroupsIds,
      app: app.id,
    });
  }

  // Hot path: called via `auth.parseToken` on every authenticated request when
  // the parseToken cache misses. Keep this lightweight — query inheritedUserApps
  // directly instead of resolving the full user with inheritedApps populate
  // (which N+1's apps.resolve and forces an extra hop through the user record).
  // Cache enabled to absorb thundering herds; cleaned via `cacheCleanEvents`
  // above when the underlying permissions actually change.
  @Action({
    params: {
      userId: {
        type: 'number',
        convert: true,
      },
      appId: {
        type: 'number',
        convert: true,
      },
    },
    cache: {
      keys: ['userId', 'appId'],
      ttl: 60 * 60,
    },
  })
  async validatePermissionToAccessApp(ctx: Context<{ userId: number; appId: number }>) {
    const { userId, appId } = ctx.params;

    const appsIds: number[] = await ctx.call('inheritedUserApps.getAppsByUser', {
      user: userId,
    });

    if (!appsIds?.some((id) => id == appId)) {
      throwUnauthorizedError('Unauthorized to access app');
    }

    return true;
  }

  @Action({
    rest: 'GET /municipalities',
  })
  async listMunicipalities() {
    const host = process.env.QGIS_SERVER_HOST;

    if (!host) {
      return {
        rows: [],
        total: 0,
      };
    }

    const searchParams = new URLSearchParams({
      SERVICE: 'WFS',
      REQUEST: 'GetFeature',
      TYPENAME: 'municipalities',
      OUTPUTFORMAT: 'application/json',
      PROPERTYNAME: 'pavadinimas,kodas',
    });

    const url = `${host}/qgisserver/uetk_zuvinimas?${searchParams.toString()}`;

    try {
      const items = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then((r) => r.json())
        .then((items) => items.features)
        .then((items) => items.map((item: any) => item.properties))
        .then((items) =>
          items.map((item: any) => ({
            name: item.pavadinimas,
            id: item.kodas,
          })),
        )
        .then((items) =>
          items.sort((item1: any, item2: any) => item1.name?.localeCompare(item2.name)),
        );

      return {
        rows: items,
        total: items.length,
      };
    } catch (err) {
      return throwBadRequestError('Cannot fetch municipalities', err);
    }
  }

  @Action({
    rest: 'POST /municipalities',
    types: [EndpointType.ADMIN, EndpointType.SUPER_ADMIN],
    params: {
      group: {
        type: 'number',
        convert: true,
      },
      municipalities: {
        type: 'array',
        items: {
          type: 'number',
          convert: true,
        },
      },
    },
  })
  async createWithMunicipalities(
    ctx: Context<{ group: number; municipalities: Array<string> }, AppAuthMeta & UserAuthMeta>,
  ) {
    if (this.isRestrictedGranter(ctx.meta.user)) {
      await this.assertCanEditGroup(ctx, ctx.params.group);
      await this.assertMunicipalitiesWithinOwn(ctx, ctx.params.municipalities);
    }

    const permission: Permission = await ctx.call('permissions.findOne', {
      query: {
        group: ctx.params.group,
        municipalities: { $exists: true },
        ...(this.isRestrictedGranter(ctx.meta.user) && { user: { $exists: false } }),
      },
    });

    if (permission && permission.id) {
      return ctx.call('permissions.update', {
        id: permission.id,
        municipalities: ctx.params.municipalities,
      });
    }

    return ctx.call('permissions.create', {
      group: ctx.params.group,
      municipalities: ctx.params.municipalities,
    });
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getAppsIdsByUser(ctx: Context<{ id: number }>) {
    const user: User = await ctx.call('users.resolve', { id: ctx.params.id });

    const isSuperAdmin = user.type === UserType.SUPER_ADMIN;

    let apps: Array<any> = [];
    if (isSuperAdmin) {
      const apps: Array<App> = await ctx.call('apps.find');
      return apps.map((app) => app.id);
    } else if (user.apps && user.apps.length) {
      // if apps assigned
      apps = user.apps;
    } else {
      // if groups assigned
      const userGroups: Array<UserGroup> = await this.getUserGroupWithApps(user.id);
      if (userGroups?.length) {
        apps = userGroups.reduce((acc, g) => {
          const collectAppsRecursively = (group: Group): Array<any> => {
            if (group?.inheritedAppsIds?.length) return group.inheritedAppsIds;
            return [];
          };

          return [...acc, ...collectAppsRecursively(g.groupWithApps)];
        }, []);
      }
    }

    return apps;
  }

  @Action({
    rest: 'GET /municipalities/:municipality/users',
    types: [EndpointType.ADMIN, EndpointType.SUPER_ADMIN],
    cache: {
      keys: ['#app.id', 'municipality', 'role'],
    },
    params: {
      municipality: 'number|convert',
      role: {
        type: 'string',
        optional: true,
        default: '',
      },
    },
  })
  async listUsersInMunicipality(
    ctx: Context<{ municipality: number; role?: UserGroupRole }, UserAuthMeta & AppAuthMeta>,
  ) {
    const { municipality, role } = ctx.params;

    const permissions: Array<Permission> = await ctx.call('permissions.find', {
      query: {
        $raw: {
          condition: `municipalities @> ?::jsonb`,
          bindings: [JSON.stringify([municipality])],
        },
        group: { $exists: true },
      },
    });

    let ids: any = await Promise.all(
      permissions.map((i) => this.broker.call('groups.getGroupChildrenIds', { id: i.group })),
    );

    ids = ids.reduce((acc: any, i: any) => [...acc, ...i], []);

    const usersIds = await ctx.call('permissions.getVisibleUsersIds');

    const query: any = {
      group: {
        $in: [...ids, ...permissions.map((i) => i.group)],
      },
      user: {
        $in: usersIds,
      },
    };

    if (role) {
      query.role = role;
    }

    const userGroups: Array<UserGroup> = await ctx.call('userGroups.find', {
      query,
      populate: 'user',
    });

    return userGroups
      .map((g) => g.user)
      .map((u: any) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
      }));
  }

  @Method
  async getPermissionsByAppAndUser(app: App, user: User): Promise<PermissionType | null> {
    const redisKey = `permissions.getPermissionsByAppAndUser:${app.id}:${user.id}`;
    const permissions = (await this.broker.cacher?.get(redisKey)) as Promise<PermissionType | null>;
    if (permissions) return permissions;

    const result = await this.computePermissionsByAppAndUser(app, user);

    await this.broker.cacher.set(redisKey, result);
    return result;
  }

  // Uncached: a read that started before a revocation can repopulate the cache with the old
  // rights, so a decision to grant must not trust it.
  @Method
  async computePermissionsByAppAndUser(app: App, user: User): Promise<PermissionType> {
    const generatePermissionResult = (features?: Array<string>, accesses?: Array<string>) => {
      return {
        [PermissionTypeEnum.ACCESSES]: accesses && accesses.length ? accesses : [],
        [PermissionTypeEnum.FEATURES]: features && features.length ? features : ['*'],
      };
    };

    const isSuperAdmin = user.type === UserType.SUPER_ADMIN;
    if (isSuperAdmin) return generatePermissionResult(['*'], ['*']); // all permissions assigned

    let features: Array<string> = [];
    let accesses: Array<string> = [];

    const assignValues = (
      items: Array<string>,
      item: Permission,
      key: PermissionTypeEnum,
      force: boolean = false,
    ) => {
      if (!item || !item[key] || !item[key].length || item.app != app.id) return items;
      if (!items.length) {
        return item[key];
      }

      if (!force) return items;
      return [...items, ...item[key]];
    };

    const mergePermissionsArrays = (
      source: Array<string>,
      dist: Array<string>,
      merge: boolean = false,
    ) => {
      if (source && source.length && !merge) return source;
      return [...source, ...dist];
    };

    // find permissions only for user
    const userPermission: Permission = await this.broker.call('permissions.findOne', {
      query: {
        user: user.id,
        group: { $exists: false },
        app: app.id,
      },
    });

    if (userPermission) {
      features = assignValues(features, userPermission, PermissionTypeEnum.FEATURES);
      accesses = assignValues(accesses, userPermission, PermissionTypeEnum.ACCESSES);
    }

    const userGroups: Array<UserGroup> = await this.getUserGroups(user.id, ['permissions']);

    // check & align user-group level permissions
    const userGroupPermissions: any = {
      [PermissionTypeEnum.FEATURES]: [],
      [PermissionTypeEnum.ACCESSES]: [],
    };
    userGroups.forEach((userGroup) => {
      if (!userGroup.permissions) return;
      userGroup.permissions.forEach((userGroupPermission) => {
        if (userGroupPermission.role && userGroup.role !== userGroupPermission.role) return;
        userGroupPermissions[PermissionTypeEnum.FEATURES] = assignValues(
          userGroupPermissions[PermissionTypeEnum.FEATURES],
          userGroupPermission,
          PermissionTypeEnum.FEATURES,
          true,
        );
        userGroupPermissions[PermissionTypeEnum.ACCESSES] = assignValues(
          userGroupPermissions[PermissionTypeEnum.ACCESSES],
          userGroupPermission,
          PermissionTypeEnum.ACCESSES,
          true,
        );
      });
    });

    features = mergePermissionsArrays(features, userGroupPermissions[PermissionTypeEnum.FEATURES]);
    accesses = mergePermissionsArrays(
      accesses,
      userGroupPermissions[PermissionTypeEnum.ACCESSES],
      true,
    );

    // group level permissions
    // first level groups are already covered - we need parents at this stage
    const groups: Array<Group> = userGroups.map((i) => i.groupWithParents).filter((i) => i);

    const collectPermissionsRecursively = (
      group: Group,
      featuresGroups: Array<string> = [],
      accessesGroups: Array<string> = [],
    ) => {
      if (group.permissions && group.permissions.length) {
        const userGroup = userGroups.find((ug) => ug.group == group.id);
        // going up the tree ADMIN or USER of his/her groups becomes USER of parent groups
        const roleInGroup = userGroup ? userGroup.role : PermissionRole.USER;

        group.permissions.map((groupPermission) => {
          if (groupPermission.role && groupPermission.role !== roleInGroup) return;
          featuresGroups = assignValues(
            featuresGroups,
            groupPermission,
            PermissionTypeEnum.FEATURES,
            true,
          );
          accessesGroups = assignValues(
            accessesGroups,
            groupPermission,
            PermissionTypeEnum.ACCESSES,
            true,
          );
        });
      }

      if (group?.parent) {
        const parentPermissions = collectPermissionsRecursively(group.parent as Group);
        featuresGroups = mergePermissionsArrays(
          featuresGroups,
          parentPermissions[PermissionTypeEnum.FEATURES],
        );
        accessesGroups = mergePermissionsArrays(
          accessesGroups,
          parentPermissions[PermissionTypeEnum.ACCESSES],
          true,
        );
      }

      return {
        [PermissionTypeEnum.FEATURES]: featuresGroups,
        [PermissionTypeEnum.ACCESSES]: accessesGroups,
      };
    };

    const mergePermissions = (permissions: Array<any>) => {
      return permissions.reduce(
        (acc: any, permission: any) => {
          acc[PermissionTypeEnum.FEATURES] = [
            ...acc[PermissionTypeEnum.FEATURES],
            ...(permission[PermissionTypeEnum.FEATURES] || []),
          ];
          acc[PermissionTypeEnum.ACCESSES] = [
            ...acc[PermissionTypeEnum.ACCESSES],
            ...(permission[PermissionTypeEnum.ACCESSES] || []),
          ];
          return acc;
        },
        {
          [PermissionTypeEnum.ACCESSES]: [],
          [PermissionTypeEnum.FEATURES]: [],
        },
      );
    };

    const groupsPermissions = mergePermissions(
      groups.map((group) => collectPermissionsRecursively(group)),
    );

    features = mergePermissionsArrays(features, groupsPermissions[PermissionTypeEnum.FEATURES]);
    accesses = mergePermissionsArrays(
      accesses,
      groupsPermissions[PermissionTypeEnum.ACCESSES],
      true,
    );

    // last level permissions - by user type
    if (!isSuperAdmin) {
      const permissionsByUserType: Array<Permission> = await this.broker.call('permissions.find', {
        query: {
          role: user.type,
          app: app.id,
          group: { $exists: false },
          user: { $exists: false },
        },
      });

      const userTypePermissions = mergePermissions(permissionsByUserType);

      features = mergePermissionsArrays(features, userTypePermissions[PermissionTypeEnum.FEATURES]);
      accesses = mergePermissionsArrays(
        accesses,
        userTypePermissions[PermissionTypeEnum.ACCESSES],
        true,
      );
    }

    return generatePermissionResult(features, accesses);
  }

  @Method
  async getVisibleUsersIdsByUser(user: User, group: number | GenericObject, edit: boolean = false) {
    let groupIds: number[];

    if (!!group) {
      const groups: Group[] = await this.broker.call('groups.find', {
        query: { id: group },
      });

      groupIds = groups?.map((group) => group.id);
    }

    if (user.type == UserType.SUPER_ADMIN) {
      if (!group) return [];

      const usersIds: Array<UserGroup> = await this.broker.call('userGroups.find', {
        query: {
          group: { $in: groupIds },
        },
        fields: 'user',
      });

      return [...usersIds.map((i) => i.user)];
    }

    let visibleGroupIds = await this.getVisibleGroupsByUser(user.id, edit && UserGroupRole.ADMIN);

    if (Array.isArray(groupIds)) {
      visibleGroupIds = visibleGroupIds.filter((visibleGroupId) =>
        groupIds.includes(visibleGroupId),
      );
    }

    const usersIds: Array<UserGroup> = await this.broker.call('userGroups.find', {
      query: {
        group: { $in: visibleGroupIds },
      },
      fields: 'user',
    });

    const usersSet = new Set([...usersIds.map((i) => i.user)]);

    if (!group) {
      usersSet.add(user.id);
    }

    return [...usersSet];
  }

  /*
   * Permission writes used to check only that the caller was ADMIN or SUPER_ADMIN, so any of
   * the ~290 ADMIN users could give anyone, themselves included, any access in any app. An
   * ADMIN now edits only groups he administers, only in apps he holds, and grants nothing he
   * does not hold himself. A SUPER_ADMIN, and internal broker calls (no user), are unchanged.
   */
  @Method
  isRestrictedGranter(user?: User): boolean {
    return !!user && user.type !== UserType.SUPER_ADMIN;
  }

  // The rule that lets him create or edit the group (groups.service `hasPermissionToAccess`),
  // plus every group he is group-ADMIN of.
  @Method
  async assertCanEditGroup(ctx: Context<unknown, AppAuthMeta & UserAuthMeta>, groupId: number) {
    const administeredGroupIds = await this.getVisibleGroupsByUser(
      ctx.meta.user.id,
      UserGroupRole.ADMIN,
    );
    if (administeredGroupIds.some((id) => Number(id) === Number(groupId))) return;

    const editableGroupIds: Array<number | string> = await ctx.call(
      'permissions.getVisibleGroupsIds',
      { edit: true },
      { meta: ctx.meta },
    );
    // A group created under an editable parent (groups.service `validateIfCanBeCreated`)
    // counts as editable too, so creating it and setting its municipalities both succeed.
    const groupAndAncestorIds = await this.getGroupAndAncestorIds(groupId);
    const isEditable = groupAndAncestorIds.some((id) =>
      editableGroupIds?.some((editableId) => Number(editableId) === id),
    );
    if (isEditable) return;

    throwForbiddenError(
      `Not authorized to change permissions of group '${groupId}'.`,
      PermissionGrantErrorType.GROUP,
    );
  }

  @Method
  async getGroupAndAncestorIds(groupId: number): Promise<Array<number>> {
    const ids: Array<number> = [];
    let group: Group | null = await this.broker.call('groups.getGroupWithParents', { id: groupId });

    while (group?.id) {
      ids.push(Number(group.id));
      group = typeof group.parent === 'object' ? (group.parent as Group) : null;
    }
    return ids;
  }

  @Method
  async assertHoldsApp(user: User, appId: number) {
    const appIds: Array<number | string> = await this.broker.call(
      'inheritedUserApps.getAppsByUser',
      { user: user.id },
    );

    if (!appIds?.some((id) => Number(id) === Number(appId))) {
      throwForbiddenError(
        `Not authorized to change permissions of app '${appId}'.`,
        PermissionGrantErrorType.APP,
      );
    }
  }

  @Method
  async assertGrantWithinOwn(
    user: User,
    appId: number,
    requested: { accesses?: Array<string>; features?: Array<string> },
  ) {
    const app: App = await this.broker.call('apps.resolve', { id: appId });
    const own = await this.computePermissionsByAppAndUser(app, user);
    const ownAccesses = own?.[PermissionTypeEnum.ACCESSES] ?? [];
    const ownFeatures = own?.[PermissionTypeEnum.FEATURES] ?? [];

    // `features` undefined: this change does not touch features. An empty list means "all
    // features" (getPermissionsByAppAndUser).
    const effectiveFeatures =
      requested.features === undefined
        ? []
        : requested.features.length
        ? requested.features
        : [PERMISSION_WILDCARD];

    const exceedsAccesses = !this.isWithin(requested.accesses ?? [], ownAccesses);
    const exceedsFeatures = !this.isWithin(effectiveFeatures, ownFeatures);

    if (exceedsAccesses || exceedsFeatures) {
      throwForbiddenError(
        'Cannot grant accesses or features the caller does not hold.',
        PermissionGrantErrorType.EXCEEDS_OWN,
      );
    }
  }

  @Method
  async assertMunicipalitiesWithinOwn(
    ctx: Context<unknown, UserAuthMeta>,
    municipalities: Array<string | number>,
  ) {
    // An empty list hands the group its parent's municipalities, which the caller cannot
    // check against his own; only someone who manages all municipalities may clear it.
    if (!municipalities.length) {
      if (await this.managesAllMunicipalities(ctx.meta.user.id)) return;

      throwForbiddenError(
        "Only a municipality manager can clear a group's municipalities.",
        PermissionGrantErrorType.EXCEEDS_OWN,
      );
    }

    const ownMunicipalities: Array<number> =
      (await this.computeUserMunicipalities(ctx, ctx.meta.user.id)) ?? [];

    const outside = municipalities.filter(
      (m) => !ownMunicipalities?.some((own) => Number(own) === Number(m)),
    );

    if (outside.length) {
      throwForbiddenError(
        "Cannot grant municipalities outside the caller's own.",
        PermissionGrantErrorType.EXCEEDS_OWN,
      );
    }
  }

  @Method
  async managesAllMunicipalities(userId: number): Promise<boolean> {
    const user: User = await this.broker.call('users.resolve', { id: userId });
    if (!user) return false;
    if (user.type === UserType.SUPER_ADMIN) return true;

    const usersApp: App = await this.broker.call('apps.getUsersApp');
    const usersAppPermissions = await this.computePermissionsByAppAndUser(usersApp, user);

    return usersAppPermissions[PermissionTypeEnum.ACCESSES].some(
      (access) =>
        access === PERMISSION_WILDCARD || access === UsersAppAccesses.MANAGE_MUNICIPALITIES,
    );
  }

  @Method
  isWithin(requested: Array<string>, held: Array<string>): boolean {
    if (held.includes(PERMISSION_WILDCARD)) return true;

    return requested.every((item) => item !== PERMISSION_WILDCARD && held.includes(item));
  }

  @Method
  async getVisibleGroupsByUser(userId: any, role?: UserGroupRole) {
    const query: any = {
      user: userId,
    };

    if (role) query.role = role;

    const userGroups: Array<UserGroup> = await this.broker.call('userGroups.find', {
      query,
      fields: 'group',
    });

    const mapOfGroups = await Promise.all(
      userGroups.map(
        async (userGroup: UserGroup) =>
          await this.broker.call('groups.getGroupChildrenIds', {
            id: userGroup.group,
          }),
      ),
    );

    mapOfGroups.push(userGroups.map((i) => i.group));

    return mapOfGroups.reduce((acc: Array<string>, item: any) => {
      return [...acc, ...item];
    }, []) as Array<any>;
  }

  @Method
  async getCompanyIdsByApp(appId: number) {
    const groups: Array<Group> = await this.broker.call('groups.find', {
      query: {
        $raw: {
          condition: `apps_ids @> ?::jsonb`,
          bindings: [JSON.stringify([Number(appId)])],
        },
        companyCode: { $exists: true },
      },
      fields: ['id'],
    });

    return groups.map((i) => i.id);
  }

  @Method
  collectAppsRecursively(group: Group): Array<any> {
    if (!group) return [];
    if (group.apps && group.apps.length) return group.apps;

    if (group?.parent) return this.collectAppsRecursively(group.parent as Group);

    return [];
  }

  @Method
  getUserGroups(userId: number, populate?: Array<string>): Promise<Array<UserGroup>> {
    populate = populate || [];
    populate.push('groupWithParents');
    return this.broker.call('userGroups.find', {
      query: { user: userId },
      populate,
    });
  }

  @Method
  assignPermissionsFilters(ctx: any) {
    if (!ctx.meta.user) return ctx;

    if (typeof ctx.params.query === 'string') {
      ctx.params.query = JSON.parse(ctx.params.query);
    }

    ctx.params.query = ctx.params.query || {};

    if (!ctx.params.query.municipalities || !ctx.params.query.app) {
      ctx.params.query.app = { $exists: true };
    }

    // TODO: Fix filtering by flag or find another solution

    return ctx;
  }

  @Method
  getUserGroupWithApps(userId: number, populate?: Array<string>): Promise<Array<UserGroup>> {
    populate = populate || [];
    populate.push('groupWithApps');
    return this.broker.call('userGroups.find', {
      query: { user: userId },
      populate,
    });
  }
}
