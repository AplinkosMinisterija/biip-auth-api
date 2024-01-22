'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';

import DbConnection from '../mixins/database.mixin';
import {
  COMMON_FIELDS,
  COMMON_DEFAULT_SCOPES,
  COMMON_SCOPES,
  FieldHookCallback,
  BaseModelInterface,
  throwNotFoundError,
  throwUnauthorizedError,
  throwValidationError,
  DISABLE_REST_ACTIONS,
  throwBadRequestError,
} from '../types';

import { companyCode as companyCodeChecker } from 'lt-codes';

import { App } from './apps.service';
import { User, UserType } from './users.service';
import { UserGroup, UserGroupRole } from './userGroups.service';
import { AppAuthMeta, UserAuthMeta } from './api.service';
import { toggleItemInArray } from '../utils/array';
import { Permission } from './permissions.service';
export interface Group extends BaseModelInterface {
  name: string;
  apps: App[];
  parent: number | Group;
  inheritedApps?: App[];
  permissions?: Permission[];
  inheritedAppsIds?: number[];
  companyCode: string;
  companyEmail: string;
  companyPhone: string;
}

@Service({
  name: 'groups',

  mixins: [
    DbConnection({
      collection: 'groups',
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

      name: 'string',

      parent: {
        type: 'number',
        validate: 'validateParent',
        columnType: 'integer',
        columnName: 'parentId',
        populate(ctx: any, _values: any, items: any[]) {
          const additionalParams: Object = this.getAdditionalPopulateParamsForRecursiveGroups(
            ctx.params.populate,
          );
          return Promise.all(
            items.map(async (group: any) => {
              const g = await ctx.call('groups.getGroupWithParents', {
                id: group.id,
                ...additionalParams,
              });
              return g?.parent;
            }),
          );
        },
      },

      users: {
        type: 'array',
        items: { type: 'object' },
        virtual: true,
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              const userGroups: Array<UserGroup> = await ctx.call('groups.getVisibleGroupUsers', {
                id: item.id,
                populate: 'user',
              });
              if (!userGroups || !userGroups.length) return [];
              return userGroups.map((i) => ({
                ...(i.user as User),
                role: i.role,
              }));
            }),
          );
        },
      },

      children: {
        type: 'array',
        virtual: true,
        items: { type: 'object' },
        populate(ctx: any, _values: any, items: any[]) {
          const additionalParams: Object = this.getAdditionalPopulateParamsForRecursiveGroups(
            ctx.params.populate,
          );
          return Promise.all(
            items.map(async (group: any) => {
              return await ctx.call('groups.getGroupWithChildren', {
                id: group.id,
                ...additionalParams,
              });
            }),
          );
        },
      },

      companyCode: {
        type: 'string',
        immutable: true,
        validate: 'validateCompanyCode',
      },

      companyEmail: {
        type: 'string',
        set({ value }: FieldHookCallback) {
          if (typeof value === 'string') return value.toLowerCase();
          return value;
        },
      },

      companyPhone: 'string',

      apps: {
        type: 'array',
        items: { type: 'number' },
        validate: 'validateApps',
        columnName: 'appsIds',
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
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              const appsIds = await ctx.call('inheritedGroupApps.getAppsByGroup', {
                group: item.id,
              });
              if (!appsIds) return [];
              return ctx.call('apps.resolve', { id: appsIds });
            }),
          );
        },
      },

      inheritedAppsIds: {
        type: 'array',
        virtual: true,
        items: { type: 'object' },
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              const appsIds = await ctx.call('inheritedGroupApps.getAppsByGroup', {
                group: item.id,
              });
              return appsIds || [];
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
                  user: { $exists: false },
                  group: item.id,
                },
              });
            }),
          );
        },
      },

      usersCount: {
        type: 'number',
        virtual: true,
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              return ctx.call('userGroups.usersCountInGroup', { id: item.id });
            }),
          );
        },
      },

      municipalities: {
        type: 'array',
        items: 'string',
        virtual: true,
        populate(ctx: any, _values: any, items: any[]) {
          return Promise.all(
            items.map(async (item: any) => {
              const permission: any = await ctx.call('permissions.findOne', {
                query: { group: item.id, municipalities: { $exists: true } },
              });
              if (permission && permission.id) return permission.municipalities;
              return [];
            }),
          );
        },
      },

      ...COMMON_FIELDS,
    },

    scopes: {
      ...COMMON_SCOPES,
    },

    defaultScopes: [...COMMON_DEFAULT_SCOPES],
  },

  hooks: {
    before: {
      list: 'assignGroupFilters',
      get: 'validateIfGroupAccessable',
      update: 'validateIfAuthorized',
      create: 'validateIfCanBeCreated',
      remove: 'assignUsersToOtherGroup',
      removeGroup: 'validateIfAuthorized',
    },
  },

  actions: {
    ...DISABLE_REST_ACTIONS,
    create: {
      types: [UserType.SUPER_ADMIN, UserType.ADMIN],
    },
    update: {
      types: [UserType.SUPER_ADMIN, UserType.ADMIN],
    },
    remove: {
      rest: null,
      types: [UserType.SUPER_ADMIN, UserType.ADMIN],
    },
  },

  events: {
    async 'groups.removed'(ctx: Context<{ data: { id: number } }, UserAuthMeta>) {
      const { id } = ctx.params.data;
      this.removeEntities(ctx, { query: { parent: id } }, { meta: ctx.meta });
    },
  },
})
export default class GroupsService extends moleculer.Service {
  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getGroupWithChildren(ctx: Context<{ id: number; populate?: string | Array<string> }>) {
    const { populate } = ctx.params;
    const innerGroups: Array<Group> = await ctx.call('groups.find', {
      query: { parent: ctx.params.id },
      populate,
    });
    return Promise.all(
      innerGroups.map(async (group: any) => {
        const children: Array<any> = await ctx.call('groups.getGroupWithChildren', {
          id: group.id,
          populate,
        });
        if (!children || !children.length) return group;
        group.children = children;
        return group;
      }),
    );
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getGroupWithParents(ctx: Context<{ id: number; populate?: string | Array<string> }>) {
    const { populate } = ctx.params;
    const group: Group = await ctx.call('groups.resolve', {
      id: ctx.params.id,
      populate,
    });

    if (group?.parent) {
      group.parent = await ctx.call('groups.getGroupWithParents', {
        id: group.parent,
        populate,
      });
    }

    return group;
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getGroupChildrenIds(ctx: Context<{ id: number }>) {
    const groups = await ctx.call('groups.getGroupWithChildren', {
      id: ctx.params.id,
    });

    const mapIdRecursively = (items: any) => {
      return items.reduce((acc: Array<string>, i: any) => {
        acc.push(i.id);
        if (i.children && i.children.length) {
          const ids: Array<string> = mapIdRecursively(i.children);
          acc.push(...ids);
        }
        return acc;
      }, []);
    };

    return mapIdRecursively(groups);
  }

  @Action()
  async findOrCreate(ctx: Context<{ companyCode: string }, AppAuthMeta>) {
    const group: Group = await ctx.call('groups.findOne', {
      query: ctx.params,
    });
    if (group) return group;

    const { companyCode } = ctx.params;

    const { meta } = ctx;
    return ctx.call(
      'groups.create',
      {
        companyCode,
        name: `Company: ${companyCode}`,
      },
      { meta },
    );
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
      appId: {
        type: 'number',
        convert: true,
      },
      append: {
        type: 'boolean',
        default: true,
      },
    },
  })
  async toggleApp(ctx: Context<{ id: number; appId: number; append: boolean }>) {
    const { id, appId, append } = ctx.params;

    const group: Group = await ctx.call('groups.resolve', { id });

    const { changed, items } = toggleItemInArray(group.apps || [], appId, append);
    if (changed) {
      await this.broker.call('groups.update', {
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
    },
  })
  async getVisibleGroupUsers(
    ctx: Context<{ id: number; populate?: string }, AppAuthMeta & UserAuthMeta>,
  ) {
    const { id, populate } = ctx.params;
    const query: any = {
      group: id,
    };
    if (ctx.meta?.user?.id && ctx.meta?.app?.id) {
      const usersIds = await ctx.call('permissions.getVisibleUsersIds', {
        edit: false,
      });
      query.user = {
        $in: usersIds,
      };
    }

    return ctx.call('userGroups.find', {
      populate,
      query,
    });
  }

  @Action({
    rest: 'DELETE /:id',
    params: {
      id: {
        type: 'number',
        convert: true,
      },
      moveToGroup: {
        type: 'number',
        convert: true,
        optional: true,
      },
    },
  })
  async removeGroup(
    ctx: Context<
      {
        id: number;
        moveToGroup?: number;
      },
      AppAuthMeta
    >,
  ) {
    const { id, moveToGroup } = ctx.params;
    const group: Group = await ctx.call('groups.resolve', {
      id,
      populate: 'inheritedAppsIds',
    });

    const { meta } = ctx;

    if (!group) {
      throwNotFoundError('Group not found');
    }

    if (group.companyCode) {
      const newApps = group.inheritedAppsIds.filter((appId) => appId !== meta.app.id);

      await ctx.call(
        'groups.update',
        {
          id,
          apps: newApps,
        },
        { meta },
      );

      return {
        success: true,
      };
    }

    return ctx.call('groups.remove', { id, moveToGroup }, { meta });
  }

  @Method
  async assignGroupFilters(ctx: any) {
    if (!ctx.meta.user) return ctx;

    if (typeof ctx.params.query === 'string') {
      ctx.params.query = JSON.parse(ctx.params.query);
    }

    ctx.params.query = ctx.params.query || {};

    const { companyCode, parent, id } = ctx.params?.query;
    const { user, app } = ctx.meta;

    let groupsIds: Array<any>;

    // not companies
    if (!companyCode) {
      ctx.params.query.companyCode = { $exists: false };
    }

    if (!parent) {
      if (user.type === UserType.SUPER_ADMIN) {
        ctx.params.query.parent = {
          $exists: false,
        };
        ctx.params.query.$raw = `apps_ids @> ANY (ARRAY ['${app.id}']::jsonb[])`;
      } else {
        const userGroups = await ctx.call('userGroups.find', {
          query: { user: user.id, role: UserGroupRole.ADMIN },
        });
        groupsIds = userGroups.map((u: any) => u.group);
      }
    } else {
      groupsIds = await ctx.call('permissions.getVisibleGroupsIds', {}, { meta: ctx.meta });
    }

    if (groupsIds) {
      const idQuery = { $in: groupsIds };
      ctx.params.query.id = id ? { $and: [id, idQuery] } : idQuery;
    }

    return ctx;
  }

  @Method
  async hasPermissionToAccess(ctx: any, id: any, edit: boolean = false) {
    if (!id) return false;

    const groupsIds: Array<any> = await ctx.call(
      'permissions.getVisibleGroupsIds',
      { edit },
      { meta: ctx.meta },
    );

    return groupsIds.some((i) => i == id);
  }

  @Method
  async validateIfGroupAccessable(ctx: any) {
    if (!ctx.meta.user) return ctx;

    const { id } = ctx.params;
    const hasPermission = await this.hasPermissionToAccess(ctx, id);
    if (!hasPermission) {
      throwNotFoundError('Group not found.');
    }

    return ctx;
  }

  @Method
  async validateIfAuthorized(ctx: any) {
    if (!ctx.meta.user) return ctx;

    const { id } = ctx.params;
    const hasPermission = await this.hasPermissionToAccess(ctx, id, true);
    if (!hasPermission) {
      throwUnauthorizedError('Do not have permissions');
    }

    return ctx;
  }

  @Method
  async assignUsersToOtherGroup(ctx: any) {
    const { id, moveToGroup } = ctx.params;
    if (!ctx.meta.user || !moveToGroup) return ctx;

    const hasPermission = await this.hasPermissionToAccess(ctx, moveToGroup, true);
    if (!hasPermission) {
      throwUnauthorizedError('Unauthorized to move users to this group.');
    }

    await ctx.call('userGroups.moveToGroup', {
      source: id,
      dist: moveToGroup,
    });

    return ctx;
  }

  @Method
  async validateIfCanBeCreated(ctx: any) {
    const { parent: parentId, companyCode, name } = ctx.params;

    if (!name && !companyCode) {
      throwValidationError('Group name is empty.', { name, companyCode });
    }

    if (!ctx.meta.user) return ctx;

    const apps = ctx.params.apps;
    const hasPermission = await this.hasPermissionToAccess(ctx, parentId, true);
    if ((!apps || !apps.length) && !parentId) {
      throwBadRequestError('Cannot be created without apps or parent.');
    }

    if (ctx.meta.user.type === UserType.SUPER_ADMIN || ctx.params.companyCode) return ctx;

    if (!parentId || !hasPermission) {
      throwUnauthorizedError('Do not have permissions');
    }

    return ctx;
  }

  @Method
  async validateApps({ ctx, value, operation, entity }: FieldHookCallback) {
    const params = ctx.params as any;
    const parentId = (params && params.parent) || (entity && entity.parent);
    if ((operation == 'create' || (entity && entity.apps != value)) && parentId) {
      const group: Group = await ctx.call('groups.getGroupWithParents', {
        id: parentId,
      });

      const findAppsIds = (group: Group): Array<any> => {
        if (group?.apps && group.apps.length) return group.apps;
        if (group?.parent) return findAppsIds(group.parent as Group);
        return [];
      };

      const apps: Array<string> = findAppsIds(group);

      const everyGroupMatches = value.every((i: string) => apps.includes(i));

      if (!everyGroupMatches) return `Apps '${value}' cannot be assigned`;
    }
    return true;
  }

  @Method
  async validateParent({ ctx, value, entity }: FieldHookCallback) {
    if (entity && entity.parent != value) {
      const id = entity.id;
      const childrenIds: Array<string> = await ctx.call('groups.getGroupChildrenIds', { id });

      if (childrenIds.includes(value) || value === id)
        return `Parent '${value}' cannot be assigned (recursively)`;
    }
    return true;
  }

  @Method
  getAdditionalPopulateParamsForRecursiveGroups(populate: string | Array<string>) {
    const findInPopulate = (find: string) => {
      if (typeof populate === 'string') {
        populate = populate.split(',');
      }

      return populate.includes(find);
    };

    const params: any = {};

    if (findInPopulate('apps')) params.populate = 'apps';
    if (findInPopulate('inheritedApps')) params.populate = 'inheritedApps';

    return params;
  }

  @Method
  async validateCompanyCode({ value, operation, entity }: FieldHookCallback) {
    if (!value) return true;

    if (operation == 'create' || (entity && entity.companyCode != value)) {
      const found: number = await this.broker.call('groups.count', {
        query: { companyCode: value },
      });

      if (found > 0) {
        return `Company with company code '${value}' already exists.`;
      }

      const { isValid } = companyCodeChecker.validate(value);

      if (!isValid) return 'Invalid company code';
    }

    return true;
  }
}
