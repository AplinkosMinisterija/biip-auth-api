'use strict';

import bcrypt from 'bcryptjs';
import moleculer, { Context } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';
import DbConnection from '../mixins/database.mixin';
import {
  BaseModelInterface,
  COMMON_DEFAULT_SCOPES,
  COMMON_FIELDS,
  COMMON_SCOPES,
  EndpointType,
  FieldHookCallback,
  throwNoTokenError,
  throwNotFoundError,
  throwUnauthorizedError,
} from '../types';

import {
  emailCanBeSent,
  generateHashAndSignatureQueryParams,
  generateUUID,
  sendUserInvitationEmail,
} from '../utils';
import { AppAuthMeta, UserAuthMeta } from './api.service';
import { App } from './apps.service';
import { UserGroupRole } from './userGroups.service';
import { User, UserType } from './users.service';

export interface UserLocal extends BaseModelInterface {
  user: number | User;
  userId?: number;
  email: string;
  password: string;
}

@Service({
  name: 'usersLocal',

  mixins: [
    DbConnection({
      collection: 'usersEvartai',
      rest: false,
    }),
  ],

  settings: {
    plantuml: {
      relations: {
        users: 'zero-or-one-to-one',
      },
    },

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
        columnName: 'userId',
        required: true,
        immutable: true,
        populate: 'users.resolve',
      },

      email: {
        type: 'string',
        required: true,
        validate: 'validateEmail',
        set({ value }: FieldHookCallback) {
          if (typeof value === 'string') return value.toLowerCase();
          return value;
        },
      },

      changeHash: {
        type: 'string',
        hidden: true,
      },

      password: {
        type: 'string',
        min: 8,
        // hidden: true,
        validate: 'validatePassword',
        set({ value, entity }: FieldHookCallback) {
          if (!value) return (entity && entity.password) || '';
          return this.encryptPassword(value);
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
      invite: 'validateIfDataIsValid',
      updateUser: ['validateIfDataIsValid', 'validateIfAuthorized'],
    },
  },
})
export default class UsersLocalService extends moleculer.Service {
  /**
   * Handle login validation
   */
  @Action()
  async validateLogin(ctx: Context<{ email: string; password: string; old: boolean }>) {
    const { email, password } = ctx.params;

    const adapter = await this.getAdapter(ctx);

    const userLocal: UserLocal = await adapter.findOne({
      query: { email, ...COMMON_SCOPES.notDeleted },
    });

    const error = {
      message: 'Wrong password.',
      type: 'WRONG_PASSWORD',
      code: 400,
    };

    if (ctx.params.old) {
      error.message = 'Wrong old password.';
      error.type = 'WRONG_OLD_PASSWORD';
    }

    if (!userLocal) {
      throw new moleculer.Errors.MoleculerClientError(error.message, error.code, error.type);
    }

    const valid = await this.isPasswordValid(password, userLocal.password);
    if (!valid) {
      throw new moleculer.Errors.MoleculerClientError(error.message, error.code, error.type);
    }

    return {
      id: userLocal.userId,
      userId: userLocal.id,
    };
  }

  @Action()
  async validateRemind(ctx: Context<{ email: string }>) {
    const { email } = ctx.params;

    const userLocal: UserLocal = await this.findEntity(ctx, {
      query: { email },
    });

    if (!userLocal) {
      throwNotFoundError('Email not found');
    }

    return {
      id: userLocal.user,
      userId: userLocal.id,
    };
  }

  @Action({
    rest: {
      method: 'POST',
      path: '/batch',
      basePath: '/users',
    },
    params: {
      users: {
        type: 'array',
        items: 'any',
      },
    },
  })
  async inviteBatch(ctx: Context<{ users: Array<any> }>) {
    const { users } = ctx.params;

    if (!users.length) return { success: false };

    const result = await Promise.all(
      users.map((user) => ctx.call('usersLocal.invite', user, { meta: ctx.meta })),
    );

    return {
      items: result,
    };
  }

  @Action({
    rest: {
      method: 'POST',
      path: '/',
      basePath: '/users',
    },
    auth: EndpointType.PUBLIC,
    params: {
      email: 'string',
      groups: {
        optional: true,
        type: 'array',
        items: {
          type: 'object',
          props: {
            id: { type: 'number', convert: true },
            role: { type: 'string', optional: true },
          },
        },
      },
      unassignExistingGroups: {
        type: 'boolean',
        default: true,
      },
    },
  })
  async invite(
    ctx: Context<
      {
        email: string;
        firstName: string;
        lastName: string;
        type: UserType;
        phone: string;
        groups: Array<{
          id: number;
          role: UserGroupRole;
        }>;
        password: string;
        apps: number[];
        doNotSendEmail: boolean;
        unassignExistingGroups: boolean;
      },
      AppAuthMeta & UserAuthMeta & { hasPermissions: boolean }
    >,
  ) {
    const { meta } = ctx;

    const appId = meta?.app?.id;

    const hasPermissions =
      !!meta?.user?.id || !!meta?.app?.settings?.canInviteSelf || !!meta?.hasPermissions;

    if (!hasPermissions) {
      throwNoTokenError();
    }

    if (meta.user?.type === UserType.USER) {
      ctx.params.apps = [appId];
    }

    const { email, groups, password, apps, unassignExistingGroups } = ctx.params;

    const userLocal: UserLocal = await ctx.call('usersLocal.findOrCreate', {
      email,
      firstName: ctx.params.firstName,
      lastName: ctx.params.lastName,
      type: ctx.params.type,
      phone: ctx.params.phone,
    });

    if (apps?.length) {
      const alreadyHadApps = await ctx.call('users.toggleApps', {
        id: userLocal.user,
        appsIds: ctx.params.apps,
      });

      if (alreadyHadApps && !groups?.length) {
        throw new moleculer.Errors.ValidationError(
          `User with email '${email}' already exists.`,
          'AUTH_USER_EXISTS',
        );
      }
    }

    if (groups?.length) {
      const hasGroupChanges = await ctx.call('users.assignGroups', {
        id: userLocal.user,
        groups,
        unassign: !!unassignExistingGroups,
      });

      if (!hasGroupChanges) {
        throw new moleculer.Errors.ValidationError(
          `User is already assigned to every group.`,
          'AUTH_USER_ASSIGNED',
        );
      }
    }

    const changeHash = generateUUID();

    const userLocalData: any = {
      id: userLocal.id,
      changeHash,
    };

    if (!appId && password) {
      userLocalData.password = password;
    }

    await ctx.call('usersLocal.update', userLocalData);

    const queryData: any = {
      u: userLocal.id, // local user
      h: changeHash, // change hash
    };

    if (ctx?.meta?.user?.id) {
      queryData.ua = ctx.meta.user?.id; // person assigned
    }

    const invitationQuery = generateHashAndSignatureQueryParams(queryData);

    const user: User = await ctx.call('users.resolve', { id: userLocal.user });

    if (appId) {
      const app: App = await ctx.call('apps.resolve', {
        id: appId,
        throwIfNotExist: true,
      });

      const url = `${app.url}/pakvietimas?${invitationQuery}`;

      if (!emailCanBeSent() || ctx.params.doNotSendEmail) {
        return { ...user, url };
      }

      await sendUserInvitationEmail(user.email, url, meta?.user, app.settings?.productNameTo);
    }

    return user;
  }

  @Action({
    rest: {
      method: 'PATCH',
      path: '/:id',
      basePath: '/users',
    },
    params: {
      id: {
        type: 'number',
        convert: true,
      },
      groups: {
        optional: true,
        type: 'array',
        items: {
          type: 'object',
          props: {
            id: {
              type: 'number',
              convert: true,
            },
            role: { type: 'string', optional: true },
          },
        },
      },
      unassignExistingGroups: {
        type: 'boolean',
        default: true,
      },
    },
  })
  async updateUser(
    ctx: Context<
      {
        id: number;
        email: string;
        password: string;
        oldPassword: string;
        firstName: string;
        lastName: string;
        type: string;
        phone: string;
        groups: Array<{
          id: number;
          role: UserGroupRole;
        }>;
        apps: string[];
        unassignExistingGroups: boolean;
      },
      AppAuthMeta & UserAuthMeta
    >,
  ) {
    const { id, groups, password, oldPassword, email, unassignExistingGroups } = ctx.params;
    await ctx.call('users.resolve', { id, throwIfNotExist: true });

    const { meta } = ctx;

    const userLocal: UserLocal = await ctx.call('usersLocal.findOne', {
      query: { user: id },
    });

    if (userLocal && password) {
      const result: any = await ctx.call('usersLocal.validateLogin', {
        email: userLocal.email,
        password: oldPassword,
        old: true,
      });
      if (!result || !result.id || !result.userId) {
        throw new moleculer.Errors.MoleculerClientError('BAD REQUEST', 401, 'BAD_REQUEST');
      }

      await ctx.call(
        'usersLocal.update',
        {
          id: userLocal.id,
          password,
        },
        { meta },
      );
    }

    if (userLocal && email) {
      await ctx.call(
        'usersLocal.update',
        {
          id: userLocal.id,
          email,
        },
        { meta },
      );
    }

    if (groups) {
      await ctx.call(
        'users.assignGroups',
        {
          id,
          groups,
          unassign: !!unassignExistingGroups,
        },
        { meta },
      );
    }

    return ctx.call('users.update', ctx.params, { meta });
  }

  @Action({
    params: {
      id: [
        {
          type: 'array',
          items: 'number|convert',
        },
        'number|convert',
      ],
      mapping: 'boolean|default:false',
    },
  })
  async isUserInvited(ctx: Context<{ id: number | number[]; mapping: boolean }>) {
    const { id, mapping } = ctx.params;

    if (mapping) {
      const users: UserLocal[] = await ctx.call('usersLocal.find', {
        query: {
          id: { $in: Array.isArray(id) ? id : [id] },
        },
        fields: ['id', 'password'],
      });

      return users.reduce(
        (acc: any, item) => ({
          ...acc,
          [item.id]: !item.password,
        }),
        {},
      );
    }

    const adapter = await this.getAdapter(ctx);

    const userLocal: UserLocal = await adapter.findOne({
      query: { userId: id, ...COMMON_SCOPES.notDeleted },
      fields: ['password'],
    });

    if (!userLocal) return false;

    return !userLocal.password;
  }

  @Action()
  async findOrCreate(ctx: Context<{ email: string }, AppAuthMeta>) {
    const { meta } = ctx;
    const { email } = ctx.params;

    const userLocal: UserLocal = await ctx.call('usersLocal.findOne', {
      query: {
        email,
      },
    });

    if (userLocal) return userLocal;

    const user: User = await ctx.call('users.create', ctx.params, { meta });
    return await ctx.call(
      'usersLocal.create',
      {
        email,
        user: user.id,
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

    const userLocal: UserLocal = await this.findEntity(ctx, {
      query: { user: id },
    });

    if (!user || !userLocal) {
      throwNotFoundError('User not found');
    }

    await ctx.call('users.remove', { id }, { meta });
    await ctx.call('usersLocal.remove', { id: userLocal.id }, { meta });

    return user.id;
  }

  @Method
  encryptPassword(password: string) {
    return bcrypt.hashSync(password, 10);
  }

  @Method
  isPasswordValid(hashedPassword: string, password: string) {
    return bcrypt.compare(hashedPassword, password);
  }

  @Method
  async validateEmail({ ctx, value, operation, entity }: FieldHookCallback) {
    if (operation == 'create' || (entity && entity.email != value)) {
      const found: number = await ctx.call('usersLocal.count', {
        query: { email: value },
      });
      if (found > 0) return `Email '${value}' is not available.`;
    }

    return true;
  }

  @Method
  async validatePassword({ entity, value, params }: FieldHookCallback) {
    const { password } = params;
    if (!value || (entity && entity.password === value) || !password) return true;

    if (!/[A-Z]/g.test(password)) return 'At least one uppercase letter is needed';
    if (!/[\d]/g.test(password)) return 'At least one number is needed';
    if (!/[a-z]/g.test(password)) return 'At least one lowercase letter is needed';
    if (!/[\!@#\$%\^\&\*\(\)\[\]\'\";:\.\\\-\_?\/\<\>\,\{\}`\~\|\+\=]/g.test(password))
      return 'At least one special symbol is needed';
    if (password.length < 8) return 'At least 8 characters length';

    return true;
  }

  @Method
  async validateIfAuthorized(ctx: any) {
    if (!ctx.meta.user) return ctx;

    const { id } = ctx.params;

    const usersIds: Array<any> = await ctx.call(
      'permissions.getVisibleUsersIds',
      {
        edit: true,
      },
      { meta: ctx.meta },
    );
    const hasPermission = usersIds.some((i) => i == id);

    if (!hasPermission) {
      throw new moleculer.Errors.MoleculerClientError('Unauthorized.', 401, 'UNAUTHORIZED');
    }

    return ctx;
  }

  @Method
  async validateIfDataIsValid(
    ctx: Context<
      {
        type?: string;
        groups?: Array<{ id: number; role?: string }>;
        apps?: Array<number>;
        id?: string | number;
      },
      UserAuthMeta & AppAuthMeta
    >,
  ) {
    const { user } = ctx.meta;
    const { type, groups, apps, id } = ctx.params;

    if (!user?.id) return ctx;

    const isUserSuperAdmin = user.type === UserType.SUPER_ADMIN;
    const isUserAdmin = user.type === UserType.ADMIN;
    const isUserUser = user.type === UserType.USER;
    const creatingSuperAdmin = type === UserType.SUPER_ADMIN;
    const creatingAdmin = type === UserType.ADMIN;
    const creatingUser = type === UserType.USER;

    const adminCreatesAdmin = creatingAdmin && isUserAdmin;
    const superAdminCreatesAdmin = creatingAdmin && isUserSuperAdmin;
    const superAdminCreatesSuperAdmin = creatingSuperAdmin && isUserSuperAdmin;

    if (
      type &&
      !adminCreatesAdmin &&
      !superAdminCreatesAdmin &&
      !superAdminCreatesSuperAdmin &&
      !creatingUser
    ) {
      // Admin can be created by other admin (regular or super). Super admin can be created only by super admin
      throwUnauthorizedError();
    }

    if (groups?.length && !creatingSuperAdmin) {
      const groupsIds: Array<any> = await ctx.call(
        'permissions.getVisibleGroupsIds',
        { edit: true },
        { meta: ctx.meta },
      );

      const hasPermissions = groups.every((g) => groupsIds.some((gid: any) => gid == g.id));

      if (!hasPermissions) {
        throw new moleculer.Errors.ValidationError(
          'Do not have permission to access this group.',
          'INVALID_GROUPS',
        );
      }
    } else if (!id && !groups?.length && isUserUser) {
      // USER can only invite to groups
      throw new moleculer.Errors.ValidationError('Groups must be passed.', 'NO_GROUPS');
    }

    if (apps?.length && !creatingSuperAdmin) {
      const appsIds: Array<any> = await ctx.call('inheritedUserApps.getAppsByUser', {
        user: user.id,
      });

      const hasPermissions = apps.every((app) => appsIds.some((aid: any) => aid == app));

      if (!hasPermissions) {
        throw new moleculer.Errors.ValidationError(
          'Do not have permission to access this app.',
          'INVALID_APPS',
        );
      }
    }

    // no apps & no groups passed
    let appsOrGroupsShouldBeAssigned = !apps?.length && !groups?.length;

    if (id) {
      const userToUpdate: User = await this.broker.call('users.resolve', {
        id,
        populate: 'groups',
      });

      let userInfoCanBeChanged = true;

      // unassigning groups
      if (groups && !groups.length) {
        // required if unassigning apps as well OR user has no apps right now
        userInfoCanBeChanged =
          userInfoCanBeChanged && !!(apps?.length || userToUpdate?.apps?.length);
      }

      // unassigning apps
      if (apps && !apps.length) {
        // required if unassigning groups as well OR user has no groups right now
        userInfoCanBeChanged =
          userInfoCanBeChanged && !!(groups?.length || userToUpdate.groups?.length);
      }

      appsOrGroupsShouldBeAssigned =
        !userInfoCanBeChanged &&
        userToUpdate.type !== UserType.SUPER_ADMIN &&
        user.id != userToUpdate.id;
    }

    if (appsOrGroupsShouldBeAssigned && !creatingSuperAdmin) {
      throw new moleculer.Errors.ValidationError(
        'User should have apps or groups assigned.',
        'APPS_OR_GROUPS_MISSING',
      );
    }

    return ctx;
  }
}
