'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';
import moment from 'moment';

import {
  emailCanBeSent,
  generateHashAndSignatureQueryParams,
  generateToken,
  generateUUID,
  sendResetPasswordEmail,
  validateHashAndSignature,
  verifyToken,
} from '../utils';
import { AppAuthMeta, AuthStrategy, UserAuthMeta } from './api.service';
import { App } from './apps.service';
import { User, UserType } from './users.service';
import { throwBadRequestError, throwNotFoundError } from '../types';

@Service({
  name: 'auth',
})
export default class AuthService extends moleculer.Service {
  @Action({
    params: {
      email: 'string',
      password: 'string',
      captchaToken: {
        type: 'string',
        optional: true,
      },
      refresh: {
        type: 'boolean',
        default: false,
      },
    },
  })
  async login(
    ctx: Context<
      {
        email: string;
        password: string;
        refresh: Boolean;
        captchaToken: string;
      },
      AppAuthMeta
    >,
  ) {
    const { email, password, refresh } = ctx.params;

    const { userId: strategyId, id }: any = await ctx.call('usersLocal.validateLogin', {
      email: email.toLowerCase(),
      password,
    });

    const user = await this.getValidatedUser(id, ctx.meta.app);

    await ctx.call('users.update', { id: user.id, lastLoggedInAt: new Date() });
    // TODO: save refresh token to check in refresh
    return this.generateToken(user, AuthStrategy.LOCAL, strategyId, refresh);
  }

  @Action({
    rest: {
      method: 'POST',
      path: '/:userId/impersonate',
      basePath: '/users',
    },
    params: {
      userId: {
        type: 'number',
        convert: true,
      },
    },
    types: [UserType.SUPER_ADMIN],
  })
  async impersonateUser(ctx: Context<{ userId: number }, AppAuthMeta>) {
    const { userId } = ctx.params;

    const user: User = await this.getValidatedUser(userId, ctx.meta.app);

    if (!user?.id) {
      return throwNotFoundError('User not found.');
    }

    const userEvartai: any = await ctx.call('usersEvartai.findOne', {
      query: { user: user.id },
    });

    const userLocal: any = await ctx.call('usersLocal.findOne', {
      query: { user: user.id },
    });

    let strategy: AuthStrategy;
    let strategyId: number;
    if (userEvartai?.id) {
      strategy = AuthStrategy.EVARTAI;
      strategyId = userEvartai.id;
    } else if (userLocal?.id) {
      strategy = AuthStrategy.LOCAL;
      strategyId = userLocal.id;
    }

    if (!strategy || !strategyId) {
      return throwNotFoundError('User strategy not found.');
    }

    return this.generateToken(user, strategy, strategyId, false);
  }

  @Action({
    params: {
      ticket: 'string',
      defaultGroupId: {
        type: 'number',
        convert: true,
        optional: true,
      },
      refresh: {
        type: 'boolean',
        optional: true,
        default: false,
      },
    },
  })
  async loginEvartai(
    ctx: Context<{ ticket: string; refresh: Boolean; defaultGroupId?: number }, AppAuthMeta>,
  ) {
    const { ticket, refresh, defaultGroupId } = ctx.params;

    const { userId: strategyId, id }: any = await ctx.call(
      'usersEvartai.validateLogin',
      { ticket, defaultGroupId },
      { meta: ctx.meta },
    );

    const user = await this.getValidatedUser(id, ctx.meta.app);

    await ctx.call('users.update', { id: user.id, lastLoggedInAt: new Date() });

    return this.generateToken(user, AuthStrategy.EVARTAI, strategyId, refresh);
  }

  @Action({
    params: {
      token: 'string',
    },
  })
  async refreshToken(ctx: Context<{ token: string }, AppAuthMeta>) {
    const { token } = ctx.params;

    const { id, strategy, strategyId }: any = await ctx.call(
      'auth.parseToken',
      { token },
      { meta: ctx.meta },
    );

    if (!id) {
      return throwNotFoundError('User not found to refresh token.');
    }
    // TODO: check if refresh token exists

    const userLoggedIn: User = await this.broker.call('users.resolve', { id });

    if (!userLoggedIn) {
      return throwNotFoundError('User not found.');
    }

    const user = await this.getValidatedUser(id, ctx.meta.app);

    await ctx.call('users.update', { id: user.id, lastLoggedInAt: new Date() });

    return this.generateToken(user, strategy, strategyId, true);
  }

  @Action({
    params: {
      h: 'string',
      s: 'string',
    },
  })
  async verifyChange(ctx: Context<{ h: string; s: string }, AppAuthMeta>) {
    const {
      u: userLocalId,
      h: hash,
      ua: userAssigned,
    }: any = validateHashAndSignature(ctx.params.h, ctx.params.s);

    if (!userLocalId || !hash) {
      return throwNotFoundError('User not found.');
    }

    const userInvitee: any = await ctx.call('usersLocal.findOne', {
      query: { id: userLocalId, changeHash: hash },
    });

    if (!userInvitee) {
      return throwNotFoundError('Invitee not found.');
    }

    const result: any = {
      user: {
        email: userInvitee.email,
      },
    };

    if (userAssigned) {
      const userInviter: User = await ctx.call('users.resolve', {
        id: userAssigned,
      });
      result.inviter = {
        name: `${userInviter.firstName} ${userInviter.lastName}`,
        email: `${userInviter.email}`,
      };
    }

    return result;
  }

  @Action({
    params: {
      h: 'string',
      s: 'string',
      password: 'string',
    },
  })
  async acceptChange(ctx: Context<{ h: string; s: string; password: string }, AppAuthMeta>) {
    const { password } = ctx.params;
    const { u: userLocalId, h: hash }: any = validateHashAndSignature(ctx.params.h, ctx.params.s);

    if (!userLocalId || !hash) {
      return throwNotFoundError('User not found.');
    }

    const userInvitee: any = await ctx.call('usersLocal.findOne', {
      query: { id: userLocalId, changeHash: hash },
    });

    if (!userInvitee) {
      return throwNotFoundError('Invitee not found.');
    }

    await ctx.call('usersLocal.update', {
      id: userInvitee.id,
      password,
      changeHash: '',
    });

    return { success: true };
  }

  @Action({
    cache: {
      keys: ['token', '#app.id'],
    },
    params: {
      token: 'string',
    },
  })
  async parseToken(ctx: Context<{ token: string }, AppAuthMeta>) {
    const token = ctx.params.token;
    try {
      const result: any = await verifyToken(token);
      if (result && result.id) {
        await this.broker.call('permissions.validatePermissionToAccessApp', {
          appId: ctx.meta.app.id,
          userId: result.id,
        });

        return result;
      }
    } catch (e) {
      this.logger.error('Error resolving token', token, e);
    }
    return {};
  }

  @Action({
    rest: {
      method: 'POST',
      path: '/logout',
      basePath: '/users',
    },
  })
  async logout(ctx: Context<{}, AppAuthMeta & UserAuthMeta>) {
    const { authToken: token } = ctx.meta;
    const valid = await ctx.call('auth.parseToken', { token }, { meta: ctx.meta });
    if (!valid) return { success: false };

    console.log('user logout', token);
    return { success: true };
  }

  @Action({
    params: {
      ticket: {
        type: 'string',
        optional: true,
      },
    },
  })
  async redirectEvartai(
    ctx: Context<
      { ticket: string; customData: string },
      { $statusCode: number; $location: string }
    >,
  ) {
    const { ticket } = ctx.params;
    ctx.meta.$statusCode = 302;

    const searchParams = new URLSearchParams({
      ticket,
      customData: ctx.params.customData,
    });

    let customData: any;
    try {
      customData = JSON.parse(ctx.params.customData);
    } catch (err) {}

    let url: string;
    if (customData?.host) url = `${customData.host}/evartai`;
    else if (customData?.url) url = customData.url;

    if (url) {
      ctx.meta.$location = `${url}?${searchParams.toString()}`;
    } else {
      ctx.meta.$location = ctx.meta.$location || 'https://biip.lt/moduliai';
    }
  }

  @Action({
    params: {
      email: 'string',
      captchaToken: {
        type: 'string',
        optional: true,
      },
    },
  })
  async remindPassword(
    ctx: Context<
      {
        email: string;
        captchaToken: string;
      },
      AppAuthMeta & UserAuthMeta
    >,
  ) {
    let { email } = ctx.params;
    email = email.toLowerCase();

    const { id, userId }: any = await ctx.call('usersLocal.validateRemind', {
      email,
    });
    const user: User = await this.getValidatedUser(id, ctx.meta.app);

    if (!user) {
      return throwNotFoundError('User not found.');
    }

    const app: App = await ctx.call('apps.resolve', {
      id: ctx.meta.app.id,
      throwIfNotExist: true,
    });

    const redisKey = `auth.remindPassword:${user.id}`;
    const timestampData = await this.broker.cacher.get(redisKey);
    if (timestampData && timestampData.timestamp)
      return { success: false, invalidUntil: timestampData.timestamp };

    const changeHash = generateUUID();

    await ctx.call(
      'usersLocal.update',
      {
        id: userId,
        changeHash,
      },
      { meta: ctx.meta },
    );

    const invitationQuery = generateHashAndSignatureQueryParams({
      u: userId, // local user
      h: changeHash, // change hash
    });

    const url = `${app.url}/atstatyti?${invitationQuery}`;

    await this.broker.cacher.set(
      redisKey,
      { timestamp: moment().utc().add(60, 'seconds').format() },
      60,
    );

    if (!emailCanBeSent()) {
      return { success: true, url };
    }

    await sendResetPasswordEmail(email, user, url);

    return { success: true };
  }

  @Action()
  async getSeedData(ctx: Context<{ hash: string }, AppAuthMeta>) {
    const users: Array<User> = await ctx.call('users.find', {
      query: {
        type: UserType.USER,
        lastLoggedInAt: { $exists: true },
      },
      populate: ['groups', 'inheritedApps'],
    });

    return users.filter((i) =>
      i.inheritedApps?.map((i) => i.id).includes(Number(ctx.meta?.app?.id)),
    );
  }

  @Method
  async getValidatedUser(id: number, app: App) {
    const user: User = await this.broker.call('users.resolve', { id });

    if (!user) {
      throwNotFoundError('User not found.');
    }

    if (user.type === UserType.SUPER_ADMIN) return user;

    const appsIds: Array<number> = await this.broker.call('inheritedUserApps.getAppsByUser', {
      user: id,
    });

    const hasApp = appsIds.some((aId) => aId == app.id);

    if (!hasApp) {
      throwNotFoundError("User doesn't have app not found.");
    }

    return user;
  }

  @Method
  async generateToken(user: User, strategy: AuthStrategy, strategyId: number, refresh: Boolean) {
    if (!strategy || !strategyId) {
      return throwBadRequestError('No strategy found.');
    }

    const tokenData = {
      ...user,
      strategy: strategy,
      strategyId: strategyId,
    };

    const token = await generateToken(tokenData);
    if (!refresh) return { token };

    const refreshToken = await generateToken(tokenData, 60 * 60 * 24 * 30); // for 30 days
    return { token, refreshToken };
  }

  created() {
    if (!process.env.JWT_SECRET) {
      this.broker.fatal("Environment variable 'JWT_SECRET' must be configured!");
    }
  }
}
