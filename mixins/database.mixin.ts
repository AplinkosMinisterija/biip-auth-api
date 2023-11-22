'use strict';

import _ from 'lodash';
const DbService = require('@moleculer/database').Service;
import config from '../knexfile';
import filtersMixin from 'moleculer-knex-filters';

export default function (opts: any = {}) {
  const adapter: any = {
    type: 'Knex',
    options: {
      knex: config,
      collection: opts.collection,
    },
  };

  const cache = {
    enabled: false,
    // additionalKeys: ['#app.id']
  };

  opts = _.defaultsDeep(opts, { adapter }, { cache });

  const events: any = {};

  if (opts.cacheCleanEvents && Array.isArray(opts.cacheCleanEvents)) {
    opts.cacheCleanEvents.forEach((event: string) => {
      events[event] = function () {
        if (this.broker.cacher) {
          this.broker.cacher.clean(`${this.name}.**`);
        }
      };
    });
  }

  const schema = {
    mixins: [DbService(opts), filtersMixin()],

    actions: {
      async findOne(ctx: any) {
        const result: Array<any> = await this.actions.find(ctx.params);
        if (result.length) return result[0];
        return;
      },

      async removeAllEntities(ctx: any) {
        return await this.clearEntities(ctx);
      },
    },

    events,

    methods: {
      filterQueryIds(ids: Array<number>, queryIds?: any) {
        if (!queryIds) return ids;

        queryIds = (Array.isArray(queryIds) ? queryIds : [queryIds]).map((id: any) => parseInt(id));

        return ids.filter((id: number) => queryIds.indexOf(id) >= 0);
      },
    },

    merged(schema: any) {
      if (schema.actions) {
        for (const action in schema.actions) {
          const params = schema.actions[action].additionalParams;
          if (typeof params === 'object') {
            schema.actions[action].params = {
              ...schema.actions[action].params,
              ...params,
            };
          }
        }
      }
    },
  };

  return schema;
}
