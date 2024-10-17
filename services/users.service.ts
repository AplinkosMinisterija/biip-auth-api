'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Event, Method, Service } from 'moleculer-decorators';

import DbConnection from '../mixins/database.mixin';
import {
  BaseModelInterface,
  COMMON_DEFAULT_SCOPES,
  COMMON_FIELDS,
  COMMON_SCOPES,
  DISABLE_REST_ACTIONS,
  EndpointType,
  FieldHookCallback,
  throwNotFoundError,
  throwUnauthorizedError,
} from '../types';
import { AppAuthMeta, AuthStrategy, UserAuthMeta } from './api.service';

import { toggleItemInArray } from '../utils/array';
import { App } from './apps.service';
import { Group } from './groups.service';
import { UserGroup, UserGroupRole } from './userGroups.service';
import { UserEvartai } from './usersEvartai.service';
import { UserLocal } from './usersLocal.service';
export enum UserType {
  ADMIN = 'ADMIN',
  USER = 'USER',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export interface User extends BaseModelInterface {
  firstName: string;
  lastName: string;
  email: string;
  type: UserType;
  permissions: { [key: string]: Array<string> };
  groups: Group[];
  apps: App[] | number[];
  inheritedApps?: App[];
  personalCode?: string;
  fullName: string;
}

@Service({
  name: 'users',

  mixins: [
    DbConnection({
      collection: 'users',
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

      firstName: 'string',

      lastName: 'string',

      email: {
        type: 'string',
        set({ value }: FieldHookCallback) {
          if (typeof value === 'string') return value.toLowerCase();
          return value;
        },
      },

      phone: 'string',

      type: {
        type: 'string',
        enum: Object.values(UserType),
        default: UserType.USER,
      },

      fullName: {
        type: 'string',
        readonly: true,
      },

      invited: {
        virtual: true,
        type: 'boolean',
        get: async ({ ctx, entity }: FieldHookCallback) => {
          const isUserEvartaiInvited: Boolean = await ctx.call('usersEvartai.isUserInvited', {
            id: entity.id,
          });
          const isUserLocalInvited: Boolean = await ctx.call('usersLocal.isUserInvited', {
            id: entity.id,
          });
          return isUserEvartaiInvited || isUserLocalInvited;
        },
      },

      permissions: {
        virtual: true,
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              return ctx.call('permissions.getUserPermissions', {
                id: item.id,
              });
            }),
          );
        },
      },

      municipalities: {
        virtual: true,
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              return ctx.call('permissions.getUserMunicipalities', {
                id: item.id,
              });
            }),
          );
        },
      },

      groups: {
        type: 'array',
        items: { type: 'object' },
        virtual: true,
        default: [],
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              const userGroups: Array<UserGroup> = await ctx.call('users.getVisibleUserGroups', {
                id: item.id,
                populate: 'group',
              });
              if (!userGroups || !userGroups.length) return [];
              return userGroups.map((i) => ({
                ...(i.group as Group),
                role: i.role,
              }));
            }),
          );
        },
      },

      apps: {
        type: 'array',
        items: { type: 'number' },
        columnName: 'appsIds',
        default: [],
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map((item: any) => {
              if (!item.appsIds) return [];
              if (typeof item.appsIds === 'string') item.appsIds = JSON.parse(item.appsIds);
              return ctx.call('apps.resolve', { id: item.appsIds });
            }),
          );
        },
      },

      inheritedApps: {
        type: 'array',
        virtual: true,
        items: { type: 'object' },
        populate: {
          keyField: 'id',
          async handler(ctx: any, userIds: number[], items: any[]) {
            if (!userIds?.length) return;

            return ctx.call('inheritedUserApps.getAppsByUser', {
              user: userIds,
              populate: 'inheritedApps',
            });
          },
        },
      },

      lastLoggedInAt: {
        type: 'date',
        columnType: 'datetime',
      },

      ...COMMON_FIELDS,
    },

    scopes: {
      ...COMMON_SCOPES,
    },

    defaultScopes: [...COMMON_DEFAULT_SCOPES],
  },

  actions: {
    ...DISABLE_REST_ACTIONS,
    create: {
      rest: null,
    },
    update: {
      rest: null,
    },
    remove: {
      rest: null,
    },
  },

  hooks: {
    before: {
      list: 'assignUsersFilters',
      get: 'validateIfUserAccessable',
      update: 'validateIfAuthorized',
      removeUser: 'validateIfAuthorized',
    },
  },
})
export default class UsersService extends moleculer.Service {
  /**
   * Get current user entity.
   */
  @Action()
  async isTokenValid(ctx: Context<{}, UserAuthMeta>) {
    const user: any = ctx.meta.user;
    return !!(user && user.id);
  }

  /**
   * Get user by JWT token (for API GW authentication)
   */
  @Action({
    rest: 'GET /me',
  })
  async me(ctx: Context<{}, UserAuthMeta>) {
    const result: any = ctx.meta.user;

    return ctx.call('users.getAuthUser', {
      id: result.id,
      type: result.strategy,
      typeId: result.strategyId,
    });
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
      type: 'string',
      typeId: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getAuthUser(ctx: Context<{ id: number; type: AuthStrategy; typeId: number }>) {
    const { type, typeId, id } = ctx.params;
    const getInnerUser = async (id: number, strategy: AuthStrategy) => {
      const strategies = {
        [AuthStrategy.LOCAL]: 'usersLocal',
        [AuthStrategy.EVARTAI]: 'usersEvartai',
      };

      const result: any = await ctx.call(`${strategies[strategy]}.resolve`, {
        id,
      });
      if (strategy === AuthStrategy.EVARTAI) {
        return {
          personalCode: result.personalCode,
        } as UserEvartai;
      }
      return {
        email: result.email,
      } as UserLocal;
    };

    if (ctx.params.id) {
      const user: User = await this.resolveEntities(ctx, {
        id,
        populate: ['permissions', 'municipalities'],
      });
      const userInner: any = await getInnerUser(typeId, type);
      return { ...userInner, ...user };
    }
  }

  @Action({
    params: {
      id: 'number|convert',
      appId: 'number|convert',
      append: {
        type: 'boolean',
        default: true,
      },
    },
  })
  async toggleApp(ctx: Context<{ id: number; appId: number; append: boolean }>) {
    const { id, appId, append } = ctx.params;

    const user: User = await ctx.call('users.resolve', { id });

    if (!user?.id) return false;

    const { changed, items } = toggleItemInArray(user.apps || [], appId, append);

    if (changed) {
      await this.broker.call('users.update', {
        id,
        apps: items,
      });
    }

    return !changed;
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
      appsIds: {
        type: 'array',
        items: ['string', 'number'],
      },
    },
  })
  async toggleApps(ctx: Context<{ id: number; appsIds: number[] | string[] }>) {
    const { id, appsIds } = ctx.params;
    const user: User = await ctx.call('users.resolve', { id });

    const userApps: number[] = (user.apps as number[]) || [];

    const alreadyHadApps = await Promise.all(
      appsIds.map((appId) =>
        ctx.call('users.toggleApp', {
          id,
          appId,
          append: !userApps?.includes(Number(appId)),
        }),
      ),
    );

    return alreadyHadApps.some((alreadyHadApp) => !!alreadyHadApp);
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
      groups: 'array',
      unassign: {
        type: 'boolean',
        default: true,
      },
    },
  })
  async assignGroups(
    ctx: Context<{ id: number; groups: Array<string>; unassign: boolean }, AppAuthMeta>,
  ) {
    const userId = ctx.params.id;
    if (!userId) return;

    const assignedGroups: UserGroup[] = await ctx.call('users.getVisibleUserGroups', {
      id: userId,
    });
    const newGroups: UserGroup[] = ctx.params.groups.map((g: any) => ({
      group: g.id,
      role: g.role,
      user: userId,
    }));

    const everyGroupAssigned = newGroups.every((ng) => assignedGroups.some((ag) => ag.id == ng.id));

    if (everyGroupAssigned) return false;

    this.assignNewGroupsToUser(newGroups, ctx.params.unassign ? assignedGroups : [], ctx.meta);
    return true;
  }

  /**
   * Validate user type
   */
  @Action({
    params: {
      types: { type: 'array', items: 'string', enum: Object.values(EndpointType) },
    },
  })
  async validateType(ctx: Context<{ types: EndpointType[] }, UserAuthMeta>) {
    const types = ctx.params.types;
    if (types.includes(EndpointType.PUBLIC)) return true;

    const userType = ctx.meta?.user?.type;
    const isAdmin = [UserType.ADMIN].includes(userType);
    const isSuperAdmin = [UserType.SUPER_ADMIN].includes(userType);
    const isUser = [UserType.USER].includes(userType);

    if (!types?.length) return true;

    let valid = false;

    if (types.includes(EndpointType.SUPER_ADMIN)) valid = valid || isSuperAdmin;
    if (types.includes(EndpointType.ADMIN)) valid = valid || isAdmin;
    if (types.includes(EndpointType.USER)) valid = valid || isUser;

    return valid;
  }

  @Action({
    rest: 'DELETE /:id',
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async removeUser(
    ctx: Context<
      {
        id: number;
      },
      AppAuthMeta
    >,
  ) {
    const { id } = ctx.params;
    const user: User = await ctx.call('users.resolve', { id });

    const { meta } = ctx;

    const userEvartai: UserEvartai = await ctx.call('usersEvartai.findOne', {
      query: { user: id },
    });
    const userLocal: UserLocal = await ctx.call('usersLocal.findOne', {
      query: { user: id },
    });

    if (!user) {
      throwNotFoundError('User not found');
    }

    if (userEvartai) {
      return ctx.call('usersEvartai.removeUser', { id }, { meta });
    } else if (userLocal) {
      return ctx.call('usersLocal.removeUser', { id }, { meta });
    }

    return ctx.call('users.remove', { id }, { meta });
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getUserCompany(ctx: Context<{ id: number }, AppAuthMeta>) {
    const { id } = ctx.params;
    const company: Group = await ctx.call('groups.findOne', {
      query: {
        id,
        companyCode: {
          $exists: true,
        },
      },
    });

    return company;
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getVisibleUserGroups(
    ctx: Context<{ id: number; populate?: string }, AppAuthMeta & UserAuthMeta>,
  ) {
    const { id, populate } = ctx.params;
    const query: any = {
      user: id,
    };
    if (ctx.meta?.app?.id) {
      const groupsIds = await ctx.call('permissions.getVisibleGroupsIds', {
        edit: false,
      });
      query.group = {
        $in: groupsIds,
      };
    }

    return ctx.call('userGroups.find', {
      populate,
      query,
    });
  }

  @Method
  assignNewGroupsToUser(newGroups: Array<UserGroup>, existingGroups: Array<UserGroup>, meta: any) {
    newGroups.forEach((ng) => {
      this.broker.call('userGroups.assign', ng, { meta });
    });

    existingGroups.forEach((eg) => {
      const groupRemoved = newGroups.every((ng) => ng.group !== eg.group);
      if (groupRemoved) {
        this.broker.call('userGroups.remove', { id: eg.id }, { meta });
      }
    });
  }

  @Method
  async getUsersIdsByAuthUserGroupPermission(ctx: any) {
    const userGroups: Array<UserGroup> = await ctx.call('userGroups.find', {
      query: {
        user: ctx.meta.user.id,
        role: UserGroupRole.ADMIN,
      },
      fields: 'group',
    });

    const mapOfGroups = await Promise.all(
      userGroups.map(async (userGroup: UserGroup) => {
        return await ctx.call('groups.getGroupChildrenIds', {
          id: userGroup.group,
        });
      }),
    );

    mapOfGroups.push(userGroups.map((i) => i.group));

    const groupIds = mapOfGroups.reduce((acc: Array<string>, item: any) => {
      return [...acc, ...item];
    }, []);

    const usersIds: Array<UserGroup> = await ctx.call('userGroups.find', {
      query: {
        group: { $in: groupIds },
      },
      fields: 'user',
    });

    return [...usersIds.map((i) => i.user), ctx.meta.user.id];
  }

  @Method
  async hasPermissionToAccess(ctx: any, id: number, edit: boolean = false) {
    const usersIds: Array<any> = await ctx.call(
      'permissions.getVisibleUsersIds',
      {
        edit,
      },
      { meta: ctx.meta },
    );

    return usersIds.some((i) => i == id);
  }

  @Method
  async validateIfUserAccessable(ctx: any) {
    if (!ctx.meta.user) return ctx;

    const { id } = ctx.params;
    const hasPermission = await this.hasPermissionToAccess(ctx, id);
    if (!hasPermission) {
      throwNotFoundError();
    }

    return ctx;
  }

  @Method
  async validateIfAuthorized(ctx: any) {
    if (!ctx.meta.user) return ctx;

    const { id } = ctx.params;
    const hasPermission = await this.hasPermissionToAccess(ctx, id, true);

    if (!hasPermission) {
      throwUnauthorizedError();
    }

    return ctx;
  }

  @Method
  async assignUsersFilters(ctx: any) {
    if (!ctx.meta.user) return ctx;

    if (typeof ctx.params.query === 'string') {
      ctx.params.query = JSON.parse(ctx.params.query);
    }

    ctx.params.query = ctx.params.query || {};

    const usersIds = await ctx.call(
      'permissions.getVisibleUsersIds',
      { group: ctx?.params?.query?.group },
      { meta: ctx.meta },
    );

    if (!ctx.params.query.type) {
      ctx.params.query.type = {
        $in: ctx.meta?.app?.isAdmin ? [UserType.ADMIN, UserType.SUPER_ADMIN] : [UserType.USER],
      };
    }

    ctx.params.query.id = {
      $in: this.filterQueryIds(usersIds, ctx.params.query.id),
    };

    delete ctx?.params?.query?.group;

    return ctx;
  }

  @Event()
  async 'userGroups.removed'(ctx: Context<{ data: { user: number } }, UserAuthMeta>) {
    const { user: userId } = ctx.params.data;
    const userGroupsCount: number = await ctx.call('userGroups.count', {
      query: { user: userId },
    });
    const user: User = await ctx.call('users.resolve', { id: userId, throwIfNotExist: true });
    if (!userGroupsCount && user.type === UserType.ADMIN && !user.apps.length) {
      await ctx.call('users.removeUser', { id: userId });
    }
    return true;
  }
}
