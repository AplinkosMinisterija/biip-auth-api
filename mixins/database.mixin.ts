'use strict';

import _ from 'lodash';
const DbService = require('@moleculer/database').Service;
import config from '../knexfile';
import filtersMixin from 'moleculer-knex-filters';
import { Context } from 'moleculer';

export function PopulateHandlerFn(action: string) {
  return async function (
    ctx: Context<{ populate: string | string[] }>,
    values: any[],
    docs: any[],
    field: any,
  ) {
    if (!values.length) return null;
    const rule = field.populate;
    let populate = rule.params?.populate;
    if (rule.inheritPopulate) {
      populate = ctx.params.populate;
    }
    const params = {
      ...(rule.params || {}),
      id: values,
      mapping: true,
      populate,
      throwIfNotExist: false,
    };

    const byKey: any = await ctx.call(action, params, rule.callOptions);

    let fieldName = field.name;
    if (rule.keyField) {
      fieldName = rule.keyField;
    }

    return docs?.map((d) => {
      const fieldValue = d[fieldName];
      if (!fieldValue) return null;
      return byKey[fieldValue] || null;
    });
  };
}

function makeMapping(
  data: any[],
  mapping?: string,
  options?: {
    mappingMulti?: boolean;
    mappingField?: string;
  },
) {
  if (!mapping) return data;

  return data?.reduce((acc: any, item) => {
    let value: any = item;

    if (options?.mappingField) {
      value = item[options.mappingField];
    }

    if (options?.mappingMulti) {
      return {
        ...acc,
        [`${item[mapping]}`]: [...(acc[`${item[mapping]}`] || []), value],
      };
    }

    return { ...acc, [`${item[mapping]}`]: value };
  }, {});
}

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

      async populateByProp(
        ctx: Context<{
          id: number | number[];
          queryKey: string;
          query: any;
          mapping?: boolean;
          mappingMulti?: boolean;
          mappingField: string;
        }>,
      ): Promise<any> {
        const { queryKey, query, mapping, mappingMulti, mappingField } = ctx.params;

        const ids = Array.isArray(ctx.params.id) ? ctx.params.id : [ctx.params.id];

        delete ctx.params.queryKey;
        delete ctx.params.id;
        delete ctx.params.mapping;
        delete ctx.params.mappingMulti;
        delete ctx.params.mappingField;

        const entities = await this.findEntities(ctx, {
          ...ctx.params,
          query: {
            ...(query || {}),
            [queryKey]: { $in: ids },
          },
        });

        const resultById = makeMapping(entities, mapping ? queryKey : '', {
          mappingMulti,
          mappingField: mappingField,
        });

        return ids.reduce(
          (acc: any, id) => ({
            ...acc,
            [`${id}`]: resultById[id] || (mappingMulti ? [] : ''),
          }),
          {},
        );
      },
    },

    events,

    hooks: {
      after: {
        find: [
          function (
            ctx: Context<{
              mapping: string;
              mappingMulti: boolean;
              mappingField: string;
            }>,
            data: any[],
          ) {
            const { mapping, mappingMulti, mappingField } = ctx.params;
            return makeMapping(data, mapping, {
              mappingMulti,
              mappingField,
            });
          },
        ],
      },
    },

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
