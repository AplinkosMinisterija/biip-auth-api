'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';

import { generateToken, verifyToken } from '../utils';
import DbConnection from '../mixins/database.mixin';
import {
  COMMON_FIELDS,
  COMMON_DEFAULT_SCOPES,
  COMMON_SCOPES,
  FieldHookCallback,
  BaseModelInterface,
  DISABLE_REST_ACTIONS,
} from '../types';
import { AppAuthMeta } from './api.service';

// default app types
export enum AppType {
  ADMIN = 'ADMIN',
  USERS = 'USERS',
}

export enum UsersAppAccesses {
  MANAGE_MUNICIPALITIES = 'MANAGE_MUNICIPALITIES',
}

export interface App extends BaseModelInterface {
  name: string;
  apiKey: string;
  type: AppType & string;
  isAdmin: boolean;
  url: string;
  settings?: {
    productNameTo?: string;
    isApp?: boolean;
    createUserOnEvartaiLogin: boolean;
    createCompanyOnEvartaiLogin: boolean;
  };
}

@Service({
  name: 'apps',

  mixins: [
    DbConnection({
      collection: 'apps',
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

      name: 'string|required',

      type: {
        type: 'string',
        required: true,
        immutable: true,
        validate: 'validateType',
      },

      apiKey: {
        type: 'string',
        hidden: true,
      },

      url: 'url|required',

      settings: {
        type: 'object',
        required: true,
        properties: {
          createUserOnEvartaiLogin: {
            type: 'boolean',
            default: false,
          },
          createCompanyOnEvartaiLogin: {
            type: 'boolean',
            default: false,
          },
          productNameTo: {
            type: 'string',
            required: true,
          },
          isApp: {
            type: 'boolean',
            default: false,
          },
        },
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
    update: {
      rest: null,
    },
    remove: {
      rest: null,
    },
    create: {
      rest: null,
    },
  },

  hooks: {
    after: {
      create: [
        async function (ctx: Context, data: any) {
          return await ctx.call('apps.regenerateApiKey', { id: data.id });
        },
      ],
    },
    before: {
      list: 'assignAppsFilters',
    },
  },
})
export default class AppsService extends moleculer.Service {
  @Action({
    rest: 'POST /:id/generate',
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async regenerateApiKey(ctx: Context<{ id: number }>) {
    const app: App = await ctx.call('apps.resolve', { id: ctx.params.id });
    const apiKey = await generateToken(
      {
        id: app.id,
        type: app.type,
        name: app.name,
      },
      60 * 60 * 365 * 100,
    );
    ctx.call(
      'apps.update',
      {
        id: app.id,
        apiKey,
      },
      { meta: ctx.meta },
    );

    app.apiKey = apiKey;
    return app;
  }

  @Action({
    params: {
      key: 'string',
    },
    cache: {
      keys: ['key'],
    },
  })
  async verifyKey(ctx: Context<{ key: string }>) {
    const app = (await verifyToken(ctx.params.key)) as App;
    if (!app) return false;

    const appDb: App = await ctx.call('apps.resolve', { id: app.id });

    if (!appDb || appDb.type !== app.type) return false;

    return {
      ...appDb,
      isAdmin: appDb.type === AppType.ADMIN,
    };
  }

  @Action({
    rest: 'GET /users',
  })
  getUsersApp(ctx: Context) {
    return ctx.call('apps.findOne', { query: { type: AppType.USERS } });
  }

  /**
   * Get app by JWT token
   */
  @Action({
    cache: {
      keys: ['#app.id'],
    },
  })
  async me(ctx: Context<{}, AppAuthMeta>) {
    return ctx.meta.app;
  }

  @Method
  async validateType({ ctx, value, operation, entity }: FieldHookCallback) {
    if (operation == 'create' || (entity && entity.type != value)) {
      const found: number = await ctx.call('apps.count', {
        query: { type: value },
      });
      if (found > 0) return `Type '${value}' is not available.`;
    }

    return true;
  }

  @Method
  async assignAppsFilters(ctx: any) {
    ctx.params.query = ctx.params.query || {};

    if (typeof ctx.params.query === 'string') {
      ctx.params.query = JSON.parse(ctx.params.query);
    }

    if (!ctx.params.query.type) {
      ctx.params.query.type = {
        $ne: AppType.USERS,
      };
    }

    if (!ctx.meta.user) return ctx;

    let appsIds: Array<number> = [];
    const { group } = ctx.params.query;
    if (group) {
      appsIds = await ctx.call('inheritedGroupApps.getAppsByGroup', {
        group: group,
      });

      delete ctx.params.query.group;
    } else {
      appsIds = await ctx.call('permissions.getAppsIdsByUser', {
        id: ctx.meta.user.id,
      });
    }

    ctx.params.query.id = {
      $in: this.filterQueryIds(appsIds, ctx.params.query.id),
    };
    return ctx;
  }
}
