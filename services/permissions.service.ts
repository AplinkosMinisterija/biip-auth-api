'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';
import { App, UsersAppAccesses } from './apps.service';
import { Group } from './groups.service';
import { UserGroup, UserGroupRole } from './userGroups.service';
import { User, UserType } from './users.service';
import DbConnection from '../mixins/database.mixin';
import {
  COMMON_FIELDS,
  COMMON_DEFAULT_SCOPES,
  COMMON_SCOPES,
  BaseModelInterface,
  throwBadRequestError,
  throwNotFoundError,
  throwUnauthorizedError,
  DISABLE_REST_ACTIONS,
} from '../types';
import { AppAuthMeta, UserAuthMeta } from './api.service';

export enum PermissionRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
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
    create: {
      rest: null,
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
    auth: false,
    params: {
      access: 'string',
      municipality: {
        type: 'number',
        convert: true,
        optional: true,
      },
    },
  })
  async findUsersByAccess(ctx: Context<{ access: string; municipality: number }>) {
    const { access, municipality } = ctx.params;

    const parentCtx: any = {};
    const permissions: Array<Permission> = await ctx.call('permissions.find', {
      query: {
        accesses: {
          $exists: true,
        },
        $raw: `"accesses" @> ANY (ARRAY ['"${access}"']::jsonb[])`,
      },
    });

    let userList: Array<any> = await Promise.all(
      permissions.map(async (p) => {
        if (p.user) return [p.user];
        else if (p.group)
          return ctx.call(
            'userGroups.usersIdsInGroupRecursively',
            { id: p.group, role: p.role },
            { parentCtx },
          );
      }),
    );

    userList = userList.reduce((acc: any, item: any) => [...acc, ...item], []);

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
    const { id } = ctx.params;
    const user: User = await ctx.call('users.resolve', {
      id,
      populate: 'permissions',
    });

    if (!user) return;

    const isSuperAdmin = user.type === UserType.SUPER_ADMIN;
    const usersApp: App = await ctx.call('apps.getUsersApp');
    const userUsersAppPermissions: any = user.permissions?.[usersApp.type];
    const hasManageMunicipalityPermission = userUsersAppPermissions
      ? userUsersAppPermissions.accesses.some(
          (i: any) => i === '*' || i === UsersAppAccesses.MANAGE_MUNICIPALITIES,
        )
      : false;

    if (isSuperAdmin || hasManageMunicipalityPermission) {
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
    ctx: Context<{
      user: number;
      group: number;
      app: number;
      role: string;
      accesses: Array<string>;
      features: Array<string>;
    }>,
  ) {
    const { user, group, app, role, accesses, features } = ctx.params;

    const query: any = {
      app,
    };

    if (!user && !group) {
      throwBadRequestError('Group or/and user should be passed.');
    }

    if (user) query.user = user;
    if (group) query.group = group;
    if (role) query.role = role;

    const permission: Permission = await ctx.call('permissions.findOne', {
      query,
    });

    const data = { ...query, accesses, features };
    if (permission && permission.id) {
      return ctx.call('permissions.update', {
        id: permission.id,
        ...data,
      });
    }

    return ctx.call('permissions.create', data);
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
    ctx: Context<{ userId: number; appId: number; edit: boolean }, UserAuthMeta & AppAuthMeta>,
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

    if (!app || !user) {
      throwNotFoundError('App not found');
    }
    if (user.type === UserType.SUPER_ADMIN) {
      return ctx.call('inheritedUserApps.getUserIdsByApp', {
        app: app.id,
      });
    }

    const usersIdsInGroup: Array<any> = await this.getVisibleUsersIdsByUser(user.id, edit);

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
    // cache: {
    //   keys: ['userId', 'appId'],
    // },
  })
  async validatePermissionToAccessApp(ctx: Context<{ userId: number; appId: number }>) {
    const app: App = await ctx.call('apps.resolve', { id: ctx.params.appId });
    const user: User = await ctx.call('users.resolve', {
      id: ctx.params.userId,
      populate: 'inheritedApps',
    });

    if (!app || !user) {
      throwNotFoundError('App not found');
    }

    const hasApp = user.inheritedApps.some((a: App) => a.id == app.id);

    if (!hasApp) {
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
  async createWithMunicipalities(ctx: Context<{ group: number; municipalities: Array<string> }>) {
    const permission: Permission = await ctx.call('permissions.findOne', {
      query: {
        group: ctx.params.group,
        municipalities: { $exists: true },
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
    cache: {
      keys: ['#app.id', 'municipality', 'role'],
    },
    params: {
      municipality: 'string',
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
        $raw: `municipalities @> ANY (ARRAY ['${municipality}']::jsonb[])`,
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
    const permissions = (await this.broker.cacher.get(redisKey)) as Promise<PermissionType | null>;
    if (permissions) return permissions;

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

    const result = generatePermissionResult(features, accesses);

    await this.broker.cacher.set(redisKey, result);
    return result;
  }

  @Method
  async getVisibleUsersIdsByUser(userId: any, edit: boolean = false) {
    const groupIds = await this.getVisibleGroupsByUser(userId, edit && UserGroupRole.ADMIN);

    const usersIds: Array<UserGroup> = await this.broker.call('userGroups.find', {
      query: {
        group: { $in: groupIds },
      },
      fields: 'user',
    });

    return [...usersIds.map((i) => i.user), userId];
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
        $raw: `apps_ids @> ANY (ARRAY ['${appId}']::jsonb[])`,
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
