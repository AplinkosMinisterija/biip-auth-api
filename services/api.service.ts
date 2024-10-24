import pick from 'lodash/pick';
import moleculer, { Context, Errors } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';
import ApiGateway from 'moleculer-web';
import { EndpointType, RequestMessage } from '../types';
import { App } from './apps.service';
import { User, UserType } from './users.service';
import { Handlers } from '@sentry/node';
export interface UserAuthMeta {
  user: User;
  authToken: string;
}
export interface AppAuthMeta {
  app: App;
}

export enum AuthStrategy {
  LOCAL = 'LOCAL',
  EVARTAI = 'EVARTAI',
}

function verifyApiKey(
  ctx: Context<Record<string, unknown>, AppAuthMeta>,
  route: any,
  req: RequestMessage,
): Promise<unknown> {
  return this.verifyApiKey(ctx, req.headers);
}

@Service({
  name: 'api',
  mixins: [ApiGateway],
  // More info about settings: https://moleculer.services/docs/0.14/moleculer-web.html
  // TODO: helmet
  actions: {
    listAliases: {
      rest: null,
    },
  },
  settings: {
    port: process.env.PORT || 3000,

    use: [Handlers.requestHandler(), Handlers.tracingHandler()],

    routes: [
      {
        path: '/',
        authorization: false,
        authentication: false,
        aliases: {
          'GET /ping': 'api.ping',
          'POST /login': 'auth.redirectEvartai',
          '* /login/evartai': 'public.evartaiHtml',
        },

        bodyParsers: {
          json: {
            strict: false,
            limit: '1MB',
          },
          urlencoded: {
            extended: true,
          },
        },
      },
      {
        path: '/api/openapi',
        authorization: false,
        authentication: false,
        aliases: {
          'GET /openapi.json': 'openapi.generateDocs', // swagger scheme
          'GET /ui': 'openapi.ui', // ui
          'GET /assets/:file': 'openapi.assets', // js/css files
        },
      },
      {
        path: '/auth',
        authorization: false,
        authentication: false,
        whitelist: [
          'auth.login',
          'auth.loginEvartai',
          'usersEvartai.sign',
          'auth.refreshToken',
          'auth.getInvitation',
          'auth.remindPassword',
          'auth.verifyChange',
          'auth.acceptChange',
          'apps.me',
          'auth.getSeedData',
        ],
        aliases: {
          'POST /login': 'auth.login',
          'POST /evartai/login': 'auth.loginEvartai',
          'POST /evartai/sign': 'usersEvartai.sign',
          'POST /refresh': 'auth.refreshToken',
          'POST /remind': 'auth.remindPassword',
          'POST /change/verify': 'auth.verifyChange',
          'POST /change/accept': 'auth.acceptChange',
          'GET /apps/me': 'apps.me',
          'GET /seedData': 'auth.getSeedData',
        },
        onBeforeCall: verifyApiKey,
      },
      {
        path: '/public',
        authorization: false,
        authentication: false,
        whitelist: ['userGroups.getPublicUsersInGroup'],
        aliases: {
          'GET /groups/:id/users': 'userGroups.getPublicUsersInGroup',
        },
        onBeforeCall: verifyApiKey,
      },
      {
        path: '/api',
        whitelist: [
          // Access to any actions in all services under "/" URL
          '**',
        ],

        // Route-level Express middlewares. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Middlewares
        use: [],

        // Enable/disable parameter merging method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Disable-merging
        mergeParams: true,

        // Enable authentication. Implement the logic into `authenticate` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authentication
        // authentication: true,

        // Enable authorization. Implement the logic into `authorize` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authorization
        // authorization: true,

        // The auto-alias feature allows you to declare your route alias directly in your services.
        // The gateway will dynamically build the full routes from service schema.
        autoAliases: true,

        aliases: {},

        // Enable authentication. Implement the logic into `authenticate` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authentication
        authentication: true,

        // Enable authorization. Implement the logic into `authorize` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authorization
        authorization: true,

        onBeforeCall: verifyApiKey,

        // Calling options. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Calling-options
        callingOptions: {},

        bodyParsers: {
          json: {
            strict: false,
            limit: '1MB',
          },
          urlencoded: {
            extended: true,
            limit: '1MB',
          },
        },

        // Mapping policy setting. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Mapping-policy
        mappingPolicy: 'all', // Available values: "all", "restrict"

        // Enable/disable logging
        logging: true,
      },
    ],
    // Do not log client side errors (does not log an error response when the error.code is 400<=X<500)
    log4XXResponses: false,
    // Logging the request parameters. Set to any log level to enable it. E.g. "info"
    logRequestParams: null,
    // Logging the response data. Set to any log level to enable it. E.g. "info"
    logResponseData: null,
  },
})
export default class ApiService extends moleculer.Service {
  @Action()
  ping() {
    return {
      timestamp: Date.now(),
    };
  }

  @Method
  async rejectAuth(
    ctx: Context<Record<string, unknown>>,
    error: Errors.MoleculerError,
  ): Promise<unknown> {
    const meta = ctx.meta as any;
    if (meta.user || meta.app) {
      const context = pick(
        ctx,
        'nodeID',
        'id',
        'event',
        'eventName',
        'eventType',
        'eventGroups',
        'parentID',
        'requestID',
        'caller',
        'params',
        'meta',
        'locals',
      );
      const action = pick(ctx.action, 'rawName', 'name', 'params', 'rest');
      const logInfo = {
        action: 'AUTH_FAILURE',
        details: {
          error,
          context,
          action,
          meta,
        },
      };
      this.logger.error(logInfo);
    }
    return Promise.reject(error);
  }

  @Method
  async verifyApiKey(
    ctx: Context<Record<string, unknown>, AppAuthMeta>,
    headers: {
      'x-api-key': string;
    },
  ): Promise<unknown> {
    const apiKey = headers['x-api-key'];

    if (apiKey) {
      try {
        const app: App = await ctx.call('apps.verifyKey', { key: apiKey });
        if (app && app.id) {
          ctx.meta.app = app;
          return Promise.resolve(ctx);
        }
      } catch (e) {
        return this.rejectAuth(
          ctx,
          new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, null),
        );
      }
    }

    return this.rejectAuth(
      ctx,
      new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_NO_TOKEN, null),
    );
  }

  @Method
  async authenticate(
    ctx: Context<Record<string, unknown>, UserAuthMeta>,
    route: any,
    req: RequestMessage,
  ): Promise<unknown> {
    const auth = req.headers.authorization;

    if (req.$action.auth === EndpointType.PUBLIC && !auth) {
      return Promise.resolve(null);
    }

    if (auth) {
      const type = auth.split(' ')[0];
      let token: string | undefined;
      if (type === 'Token' || type === 'Bearer') {
        token = auth.split(' ')[1];
      }

      if (token) {
        try {
          ctx.meta.authToken = token;
          const user = await ctx.call<User | undefined, { token: string }>('auth.parseToken', {
            token,
          });
          if (user && user.id) {
            return Promise.resolve(user);
          }
        } catch (e) {
          return this.rejectAuth(
            ctx,
            new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, null),
          );
        }
      }

      return this.rejectAuth(
        ctx,
        new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, null),
      );
    }
    return this.rejectAuth(
      ctx,
      new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_NO_TOKEN, null),
    );
  }

  /**
   * Authorize the request.
   *
   * @param {Context} ctx
   * @param {any} route
   * @param {RequestMessage} req
   * @returns {Promise}
   */
  @Method
  async authorize(
    ctx: Context<Record<string, unknown>, UserAuthMeta>,
    route: any,
    req: RequestMessage,
  ): Promise<unknown> {
    const user = ctx.meta.user;

    if (req.$action.auth === EndpointType.PUBLIC && !user) {
      return Promise.resolve(null);
    }

    if (!user) {
      return this.rejectAuth(
        ctx,
        new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_NO_TOKEN, null),
      );
    }

    const aTypes = Array.isArray(req.$action.types) ? req.$action.types : [req.$action.types];
    const oTypes = Array.isArray(req.$route.opts.types)
      ? req.$route.opts.types
      : [req.$route.opts.types];

    const allTypes = [...aTypes, ...oTypes].filter(Boolean);
    const types = [...new Set(allTypes)];
    const valid = await ctx.call<boolean, { types: UserType[] }>('users.validateType', { types });

    if (!valid) {
      return this.rejectAuth(
        ctx,
        new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, null),
      );
    }

    return Promise.resolve(ctx);
  }

  @Action({
    rest: 'POST /cache/clean',

    auth: EndpointType.PUBLIC,
  })
  cleanCache() {
    this.broker.cacher.clean();
  }
}
