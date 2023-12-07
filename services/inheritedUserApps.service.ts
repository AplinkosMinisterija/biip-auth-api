'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Service } from 'moleculer-decorators';

import DbConnection from '../mixins/database.mixin';
import { BaseModelInterface } from '../types';
import { App } from './apps.service';
import { User, UserType } from './users.service';
export interface InheritedUserApp extends BaseModelInterface {
  inheritedApps: number[] | App[];
  user: number | User;
}

@Service({
  name: 'inheritedUserApps',

  mixins: [
    DbConnection({
      collection: 'inheritedUserApps',
      rest: false,
    }),
  ],

  settings: {
    fields: {
      user: {
        type: 'number',
        columnType: 'integer',
        columnName: 'userId',
        populate: 'users.resolve',
      },

      type: {
        type: 'string',
        columnName: 'userType',
      },

      inheritedApps: {
        type: 'number',
        columnType: 'integer',
        columnName: 'inheritedAppsIds',
        populate: 'apps.resolve',
      },
    },
  },

  actions: {
    create: false,
    update: false,
    remove: false,
    replace: false,
    count: false,
    createMany: false,
    removeAllEntities: false,
  },
})
export default class InheritedUserAppsService extends moleculer.Service {
  @Action({
    params: {
      user: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getAppsByUser(ctx: Context<{ user: number }>) {
    const userWithApps: InheritedUserApp = await ctx.call('inheritedUserApps.findOne', {
      query: {
        user: ctx.params.user,
      },
    });

    return userWithApps?.inheritedApps || [];
  }

  @Action({
    params: {
      app: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getUserIdsByApp(ctx: Context<{ users?: number[]; app: number; type?: UserType }>) {
    const query: any = {
      $raw: `inherited_apps_ids @> ANY (ARRAY ['${ctx.params.app}']::jsonb[])`,
    };

    if (ctx.params.users?.length) {
      query.user = {
        $in: ctx.params.users,
      };
    }

    if (ctx.params.type) {
      query.type = ctx.params.type;
    }

    const usersWithApp: Array<InheritedUserApp> = await ctx.call('inheritedUserApps.find', {
      query,
    });

    return usersWithApp.map((u) => u.user);
  }
}
