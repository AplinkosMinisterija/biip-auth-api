'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Service } from 'moleculer-decorators';

import DbConnection from '../mixins/database.mixin';
import { BaseModelInterface } from '../types';
import { App } from './apps.service';
import { Group } from './groups.service';
export interface InheritedGroupApp extends BaseModelInterface {
  inheritedApps: number[] | App[];
  group: number | Group;
}

@Service({
  name: 'inheritedGroupApps',

  mixins: [
    DbConnection({
      collection: 'inheritedGroupApps',
      rest: false,
    }),
  ],

  settings: {
    fields: {
      group: {
        type: 'number',
        columnType: 'integer',
        columnName: 'groupId',
        populate: 'groups.resolve',
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
export default class InheritedGroupAppsService extends moleculer.Service {
  @Action({
    params: {
      group: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getAppsByGroup(ctx: Context<{ group: number }>) {
    const groupWithApp: InheritedGroupApp = await ctx.call('inheritedGroupApps.findOne', {
      query: {
        group: ctx.params.group,
      },
    });

    return groupWithApp?.inheritedApps || [];
  }

  @Action({
    params: {
      app: {
        type: 'number',
        convert: true,
      },
    },
  })
  async getGroupIdsByApp(ctx: Context<{ groups?: number[]; app: number }>) {
    const query: any = {
      $raw: `inherited_apps_ids @> ANY (ARRAY ['${ctx.params.app}']::jsonb[])`,
    };

    if (ctx.params.groups?.length) {
      query.group = {
        $in: ctx.params.groups,
      };
    }

    const groupsWithApp: Array<InheritedGroupApp> = await ctx.call('inheritedGroupApps.find', {
      query,
    });

    return groupsWithApp.map((g) => g.group);
  }
}
