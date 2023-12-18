'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Method, Service } from 'moleculer-decorators';

import { companyCode as companyCodeChecker, personalCode as personalCodeChecker } from 'lt-codes';

import DbConnection from '../mixins/database.mixin';
import {
  COMMON_FIELDS,
  COMMON_DEFAULT_SCOPES,
  COMMON_SCOPES,
  BaseModelInterface,
  FieldHookCallback,
  throwBadRequestError,
  throwNotFoundError,
} from '../types';
import { emailCanBeSent, sendEvartaiInvitationEmail } from '../utils';
import { AppAuthMeta, UserAuthMeta } from './api.service';
import { App } from './apps.service';
import { Group } from './groups.service';
import { UserGroup, UserGroupRole } from './userGroups.service';

import { User } from './users.service';

interface UserEvartaiHelper {
  firstName?: string;
  lastName?: string;
  personalCode: string;
  companyCode?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  companyEmail?: string;
  companyPhone?: string;
}

export interface UserEvartai extends BaseModelInterface {
  user: number | User;
  personalCode?: string;
  // companyCode?: string;
  // companyName?: string;
}

@Service({
  name: 'usersEvartai',

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
        required: true,
        immutable: true,
        populate: 'users.resolve',
        columnName: 'userId',
      },

      personalCode: {
        type: 'string',
        required: true,
        immutable: true,
        validate: 'validatePersonalCode',
      },

      ...COMMON_FIELDS,
    },

    scopes: {
      ...COMMON_SCOPES,
    },

    defaultScopes: [...COMMON_DEFAULT_SCOPES],
  },
})
export default class UsersEvartaiService extends moleculer.Service {
  /**
   * Handle login validation
   */
  @Action({
    params: {
      ticket: 'string',
      defaultGroupId: {
        type: 'number',
        convert: true,
        optional: true,
      },
    },
  })
  async validateLogin(ctx: Context<{ ticket: string; defaultGroupId?: number }, AppAuthMeta>) {
    const { ticket, defaultGroupId } = ctx.params;

    const userData: UserEvartaiHelper = await this.getUserByTicket(ticket);
    const { personalCode } = userData;
    const { meta } = ctx;
    const { app } = meta;
    const appId = app.id;

    const company: Group = await this.getCompanyFromCode(userData.companyCode, {
      companyName: userData.companyName,
      companyEmail: userData.companyEmail,
      companyPhone: userData.companyPhone,
      createIfNotExists: !!app.settings?.createCompanyOnEvartaiLogin,
      appId,
    });

    const userShouldBeCreated = company?.id || app.settings?.createUserOnEvartaiLogin;

    // check company apps if company exists
    if (company?.id) {
      const companyApps: Array<string | number> = (company && (company.apps as any)) || [];

      if (!companyApps.includes(Number(appId))) {
        throwNotFoundError('Company not found', { apps: companyApps });
      }
    }

    let userEvartai: UserEvartai;
    if (userShouldBeCreated) {
      userEvartai = await ctx.call('usersEvartai.findOrCreate', { personalCode }, { meta });

      await ctx.call('users.toggleApp', {
        id: userEvartai.user,
        appId: appId,
      });

      // if company is present - update role OR create relationship
      if (company?.id) {
        await ctx.call(
          'userGroups.assign',
          {
            user: userEvartai.user,
            group: company.id,
            role: UserGroupRole.ADMIN,
          },
          { meta },
        );
      }
    } else {
      userEvartai = await ctx.call('usersEvartai.findOne', {
        query: { personalCode },
      });
    }

    if (!userEvartai) {
      throwNotFoundError('Evartai user not found');
    }

    const user: User = await ctx.call('users.resolve', {
      id: userEvartai.user,
    });
    if (!user) {
      throwNotFoundError('User not found');
    }

    // default assignment to group
    if (defaultGroupId) {
      await ctx.call('userGroups.assign', {
        user: user.id,
        group: defaultGroupId,
      });
    }

    // update on every login via evartai
    const normalizeName = (words: string) => {
      if (!words) return;
      const makeWordUpperCase = (word: string) => {
        return word.charAt(0).toUpperCase() + word.substring(1);
      };

      const normalizeWords = (words: string, delimiter: string = ' ') => {
        return words
          .split(delimiter)
          .map((word: string) => makeWordUpperCase(word))
          .join(delimiter);
      };

      words = words.toLowerCase();
      words = normalizeWords(words, ' ');
      words = normalizeWords(words, '-');
      return words;
    };

    await ctx.call('users.update', {
      id: user.id,
      firstName: normalizeName(userData.firstName),
      lastName: normalizeName(userData.lastName),
      email: userData.email?.toLowerCase(),
      phone: userData.phone?.toLowerCase(),
    });

    await ctx.call('usersEvartai.update', {
      id: userEvartai.id,
      personalCode: userData.personalCode,
    });

    this.assignUserToCompanyIfCompanyExists(company, user, UserGroupRole.ADMIN);

    return {
      id: user.id,
      userId: userEvartai.id,
    };
  }

  /**
   * Generate ticket
   * Returns epaslaugos host, ticket & concatinated url
   */
  @Action({
    params: {
      host: 'string',
    },
  })
  async sign(ctx: Context<{ host: string }>) {
    try {
      return fetch(`${process.env.EVARTAI_HOST}/auth/sign`, {
        method: 'POST',
        body: JSON.stringify({ host: ctx.params.host }),
      }).then((r) => r.json());
    } catch (err) {
      return throwBadRequestError('Cannot sign ticket', err);
    }
  }

  @Action({
    rest: {
      method: 'POST',
      path: '/invite',
      basePath: '/users',
    },
    params: {
      personalCode: {
        type: 'string',
        min: 6,
        trim: true,
        optional: true,
      },
      companyCode: {
        type: 'string',
        optional: true,
        trim: true,
      },
      companyId: {
        type: 'number',
        convert: true,
        optional: true,
      },
      role: {
        type: 'string',
        optional: true,
      },
      notify: {
        type: 'array',
        items: { type: 'string', trim: true },
        optional: true,
      },
      throwErrors: {
        type: 'boolean',
        optional: true,
        default: true,
      },
    },
  })
  async invite(
    ctx: Context<
      {
        personalCode: string;
        companyCode: string;
        companyId: number;
        role: UserGroupRole;
        notify: Array<string>;
        throwErrors: boolean;
      },
      AppAuthMeta & UserAuthMeta
    >,
  ) {
    const { personalCode, companyCode, companyId, role, notify, throwErrors } = ctx.params;

    const { meta } = ctx;

    const app: App = await ctx.call('apps.resolve', {
      id: ctx.meta.app.id,
      throwIfNotExist: true,
    });

    const sendInvitations = async () => {
      const { user } = ctx.meta;

      if (!user?.id) return;

      const inviter: User = await ctx.call('users.resolve', { id: user.id });

      if (!notify || !notify.length || !inviter?.id || !emailCanBeSent()) return;

      let inviterName = `${inviter.firstName} ${inviter.lastName}`;

      let inviteType = '';

      if (companyCode) {
        inviteType = ` kaip juridinis asmuo (įm.k. ${companyCode})`;
      } else if (personalCode) {
        inviteType = ` kaip fizinis asmuo`;
      }

      return Promise.all(
        notify.map((email) => {
          return sendEvartaiInvitationEmail(
            email,
            app.url,
            app.settings?.productNameTo,
            inviterName,
            inviter.email,
            inviteType,
            !!app.settings?.isApp,
          );
        }),
      );
    };

    // validate personal/company codes
    if (personalCode) {
      const { isValid } = personalCodeChecker.validate(personalCode);
      if (!isValid) {
        throw new moleculer.Errors.ValidationError(
          `Personal code '${personalCode}' is invalid.`,
          'AUTH_INVALID_PERSONAL_CODE',
        );
      }
    }

    if (companyCode) {
      const { isValid } = companyCodeChecker.validate(companyCode);
      if (!isValid) {
        throw new moleculer.Errors.ValidationError(
          `Company code '${companyCode}' is invalid.`,
          'AUTH_INVALID_COMPANY_CODE',
        );
      }
    }

    if (!personalCode && !companyCode) {
      throw new moleculer.Errors.ValidationError(
        "The 'companyCode'/'personalCode' field is required.",
        'AUTH_INVALID_DATA',
      );
    }

    if (personalCode) {
      const userEvartai: UserEvartai = await ctx.call(
        'usersEvartai.findOrCreate',
        { personalCode },
        { meta },
      );
      const user: User = await ctx.call('users.resolve', {
        id: userEvartai.user,
      });

      const returnData = { ...user, personalCode };
      const alreadyHadApp = await ctx.call('users.toggleApp', {
        id: userEvartai.user,
        appId: app.id,
      });

      if (alreadyHadApp && !companyId) {
        if (!throwErrors) return returnData;

        throw new moleculer.Errors.ValidationError(
          `User with personal code '${personalCode}' already exists.`,
          'AUTH_USER_EXISTS',
        );
      }

      if (companyId) {
        const company: Group = await ctx.call('groups.resolve', {
          id: companyId,
        });

        if (!company?.id) {
          throwNotFoundError('Company not found');
        }

        const assignedToCompany = await this.assignUserToCompanyIfCompanyExists(
          company,
          user,
          role || UserGroupRole.USER,
        );

        if (!assignedToCompany) {
          if (!throwErrors) return returnData;

          // company code is invalid for custom app groups
          const { isValid: isValidCompanyCode } = companyCodeChecker.validate(company.companyCode);

          throw new moleculer.Errors.ValidationError(
            `User already assigned to '${companyId}' company.`,
            isValidCompanyCode ? 'AUTH_USER_ASSIGNED' : 'AUTH_USER_EXISTS',
          );
        }
      }

      await sendInvitations();
      return returnData;
    } else if (companyCode) {
      const groupExists: Group = await ctx.call(
        'groups.findOne',
        { query: { companyCode } },
        { meta: null },
      );

      if (groupExists) {
        const alreadyHadApp = await ctx.call('groups.toggleApp', {
          id: groupExists.id,
          appId: app.id,
        });

        if (alreadyHadApp && throwErrors) {
          throw new moleculer.Errors.ValidationError(
            `Company with code '${companyCode}' already exists.`,
            'AUTH_COMPANY_EXISTS',
          );
        }

        return groupExists;
      }

      const group: Group = await ctx.call(
        'groups.create',
        {
          companyCode,
          apps: [app.id],
        },
        { meta },
      );

      await sendInvitations();
      return group;
    }
  }

  @Action()
  async findOrCreate(ctx: Context<{ personalCode: string }, AppAuthMeta>) {
    const { meta } = ctx;
    const { personalCode } = ctx.params;

    const userEvartai: UserEvartai = await ctx.call('usersEvartai.findOne', {
      query: {
        personalCode,
      },
    });
    if (userEvartai) return userEvartai;

    const user: User = await ctx.call('users.create', {}, { meta });
    return await ctx.call(
      'usersEvartai.create',
      {
        personalCode,
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

    const userEvartai: UserEvartai = await this.findEntity(ctx, {
      query: { user: id },
    });

    if (!user || !userEvartai) {
      throwNotFoundError('User not found');
    }

    await ctx.call('users.toggleApp', {
      id,
      appId: ctx.meta.app.id,
      append: false,
    });

    return user.id;
  }

  @Action({
    params: {
      id: {
        type: 'number',
        convert: true,
      },
    },
  })
  async isUserInvited(ctx: Context<{ id: number }>) {
    const { id } = ctx.params;
    const user: User = await ctx.call('users.resolve', {
      id,
      fields: ['firstName', 'lastName'],
    });
    if (!user) return false;

    return !user.firstName && !user.lastName;
  }

  @Method
  async getCompanyFromCode(
    companyCode?: string,
    { companyName, companyEmail, companyPhone, createIfNotExists, appId }: any = {},
  ): Promise<Group> {
    if (!companyCode) return;

    const parentCtx: any = {};
    const group: Group = await this.broker.call(
      'groups.findOne',
      { query: { companyCode } },
      { parentCtx },
    );
    if (!group && !createIfNotExists) {
      throwNotFoundError('Group not found');
    } else if (createIfNotExists && !group) {
      const group: Group = await this.broker.call('groups.create', {
        name: companyName,
        companyEmail,
        companyPhone,
        companyCode,
      });

      if (appId) {
        await this.broker.call('groups.toggleApp', {
          id: group.id,
          appId,
          append: true,
        });
      }

      return this.broker.call('groups.resolve', { id: group.id });
    }

    if (appId) {
      await this.broker.call('groups.toggleApp', {
        id: group.id,
        appId,
        append: true,
      });
    }

    return this.broker.call('groups.update', {
      id: group.id,
      name: companyName,
      companyEmail,
      companyPhone,
    });
  }

  @Method
  async assignUserToCompanyIfCompanyExists(
    company?: Group,
    user?: User,
    role: UserGroupRole = UserGroupRole.USER,
  ) {
    if (!company) return false;

    const data = {
      user: user.id,
      group: company.id,
    };

    const userGroup: UserGroup = await this.broker.call('userGroups.findOne', {
      query: data,
    });
    if (userGroup) {
      if (userGroup.role === role) return false;

      // update role if changed
      await this.broker.call('userGroups.update', {
        id: userGroup.id,
        role,
      });

      return true;
    }

    await this.broker.call('userGroups.create', {
      ...data,
      role,
    });

    return true;
  }

  @Method
  async getUserByTicket(ticket: string): Promise<UserEvartaiHelper> {
    let userData: any;

    try {
      const url = `${process.env.EVARTAI_HOST}/auth/data?ticket=${ticket}`;
      userData = await fetch(url).then((r) => r.json());
    } catch (err) {
      throwBadRequestError('Cannot parse ticket', err);
    }

    if (!userData) return {} as UserEvartaiHelper;

    const user: UserEvartaiHelper = {
      firstName: userData.firstName,
      lastName: userData.lastName,
      personalCode: userData['lt-personal-code'],
      email: userData.email,
      phone: userData.phoneNumber,
      companyCode: userData['lt-company-code'],
      companyName: userData.companyName,
      companyEmail: userData.email,
      companyPhone: userData.phoneNumber,
    };

    return user;
  }

  @Method
  async validatePersonalCode({ value, operation, entity }: FieldHookCallback) {
    if (operation == 'create' || (entity && entity.personalCode != value)) {
      const found: number = await this.broker.call('usersEvartai.count', {
        query: { personalCode: value },
      });

      if (found > 0) {
        return `User with personal code '${value}' already exists.`;
      }

      const { isValid } = personalCodeChecker.validate(value);

      if (!isValid) return 'Invalid user personal code';
    }

    return true;
  }
}
