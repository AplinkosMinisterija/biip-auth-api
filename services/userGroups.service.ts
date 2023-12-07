'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Service } from 'moleculer-decorators';

import { AppAuthMeta, UserAuthMeta } from './api.service';
import DbConnection from '../mixins/database.mixin';
import {
  COMMON_FIELDS,
  COMMON_DEFAULT_SCOPES,
  COMMON_SCOPES,
  BaseModelInterface,
  throwNotFoundError,
} from '../types';
import { User } from './users.service';
import { Group } from './groups.service';
import { Permission } from './permissions.service';

export enum UserGroupRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface UserGroup extends BaseModelInterface {
  user: number | User;
  group: number | Group;
  role: string;
  groupWithApps?: Group;
  groupWithParents?: Group;
  permissions?: Permission[];
}

@Service({
  name: 'userGroups',

  mixins: [
    DbConnection({
      collection: 'userGroups',
      rest: false,
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
        required: true,
        immutable: true,
        populate: 'users.resolve',
        columnName: 'userId',
      },

      group: {
        type: 'number',
        columnType: 'integer',
        required: true,
        immutable: true,
        populate: 'groups.resolve',
        columnName: 'groupId',
      },

      groupWithParents: {
        type: 'array',
        virtual: true,
        items: { type: 'object' },
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              return await ctx.call('groups.getGroupWithParents', {
                id: item.groupId,
                populate: ['apps', 'permissions'],
              });
            }),
          );
        },
      },

      groupWithApps: {
        type: 'array',
        virtual: true,
        items: { type: 'object' },
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              return await ctx.call('groups.resolve', {
                id: item.groupId,
                populate: ['inheritedAppsIds'],
              });
            }),
          );
        },
      },

      permissions: {
        type: 'array',
        items: { type: 'object' },
        virtual: true,
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              return ctx.call('permissions.find', {
                query: {
                  user: item.userId,
                  group: item.groupId,
                },
              });
            }),
          );
        },
      },

      role: {
        type: 'enum',
        values: Object.values(UserGroupRole),
        default: UserGroupRole.USER,
      },

      ...COMMON_FIELDS,
    },

    // indexes: [{ fields: 'userId' }, { fields: 'groupId' }],

    scopes: {
      ...COMMON_SCOPES,
    },

    defaultScopes: [...COMMON_DEFAULT_SCOPES],
  },

  actions: {},

  events: {
    async 'groups.removed'(ctx: Context<{ data: { id: number } }, UserAuthMeta>) {
      const { id: groupId } = ctx.params.data;
      this.removeEntities(ctx, { query: { group: groupId } }, { meta: ctx.meta });
    },
    async 'users.removed'(ctx: Context<{ data: { id: number } }, UserAuthMeta>) {
      const { id: userId } = ctx.params.data;
      this.removeEntities(ctx, { query: { user: userId } }, { meta: ctx.meta });
    },
    async 'users.removedFromApp'(ctx: Context<{ data: { id: number } }, UserAuthMeta>) {
      const { id: userId } = ctx.params.data;
      this.removeEntities(ctx, { query: { user: userId } }, { meta: ctx.meta });
    },
  },
})
export default class UserGroupsService extends moleculer.Service {
  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async usersIdsInGroupRecursively(
    ctx: Context<{ id: number; role?: UserGroupRole }, AppAuthMeta & UserAuthMeta>,
  ) {
    const { id, role } = ctx.params;
    const groupsIds: Array<any> = await ctx.call('groups.getGroupChildrenIds', {
      id,
    });

    const query: any = {
      group: {
        $in: [...groupsIds, id],
      },
    };

    if (ctx.meta?.user?.id && ctx.meta?.app?.id) {
      const usersIds = await ctx.call('permissions.getVisibleUsersIds', {
        edit: false,
      });
      query.user = {
        $in: usersIds,
      };
    }

    const userGroups: Array<UserGroup> = await ctx.call('userGroups.find', {
      query,
    });

    const groupsByUserId = userGroups
      .filter((item: UserGroup) => {
        if (!role) return true;
        if (item.group == id) return item.role == role;
        return role === UserGroupRole.USER;
      })
      .reduce((acc: any, item: UserGroup) => {
        acc[`${item.user}`] = acc[`${item.user}`] || [];
        acc[`${item.user}`].push(item.group);
        return acc;
      }, {});

    return Object.keys(groupsByUserId);
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getPublicUsersInGroup(ctx: Context<{ id: number }, AppAuthMeta>) {
    const { id } = ctx.params;
    const group: Group = await ctx.call('groups.resolve', { id });
    if (!group) {
      throwNotFoundError('Group not found');
    }
    const usersIds: any = await ctx.call('userGroups.usersIdsInGroupRecursively', { id });

    const users: Array<User> = await ctx.call('users.resolve', {
      id: usersIds,
      fields: ['fullName'],
    });

    return {
      rows: users.map((i) => i.fullName),
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
  })
  async usersCountInGroup(ctx: Context<{ id: number }, AppAuthMeta & UserAuthMeta>) {
    const usersIds: any = await ctx.call('userGroups.usersIdsInGroupRecursively', {
      id: ctx.params.id,
    });

    return usersIds?.length || 0;
  }

  @Action({
    params: {
      source: {
        type: 'number',
        convert: true,
      },
      dist: {
        type: 'number',
        convert: true,
      },
    },
  })
  async moveToGroup(ctx: Context<{ source: number; dist: number }, AppAuthMeta & UserAuthMeta>) {
    return this.updateEntities(
      ctx,
      {
        query: {
          group: ctx.params.source,
        },
        changes: {
          group: ctx.params.dist,
        },
      },
      {
        permissive: true,
      },
    );
  }

  @Action({
    rest: {
      method: 'POST',
      path: '/assign',
      basePath: '/users/:user/groups/:group',
    },
    params: {
      user: {
        type: 'number',
        convert: true,
      },
      group: {
        type: 'number',
        convert: true,
      },
      role: {
        type: 'string',
        optional: true,
        enum: Object.values(UserGroupRole),
        default: UserGroupRole.USER,
      },
    },
  })
  async assign(ctx: Context<{ user: number; group: number; role: UserGroupRole }>) {
    const { user, group, role } = ctx.params;

    const userGroup: UserGroup = await ctx.call('userGroups.findOne', {
      query: { user, group },
    });

    if (!userGroup || !userGroup.id) {
      return ctx.call('userGroups.create', {
        user,
        group,
        role,
      });
    }

    if (userGroup.role === role) return userGroup;

    return ctx.call('userGroups.update', {
      id: userGroup.id,
      role,
    });
  }

  @Action({
    rest: {
      method: 'POST',
      path: '/unassign',
      basePath: '/users/:user/groups/:group',
    },
    params: {
      user: {
        type: 'number',
        convert: true,
      },
      group: {
        type: 'number',
        convert: true,
      },
    },
  })
  async unassign(ctx: Context<{ user: number; group: number }>) {
    const { user, group } = ctx.params;

    const userGroup: UserGroup = await ctx.call('userGroups.findOne', {
      query: { user, group },
    });

    if (userGroup && userGroup.id) {
      await ctx.call('userGroups.remove', { id: userGroup.id });
    }

    return { success: true };
  }
}
