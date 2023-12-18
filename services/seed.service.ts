'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Service } from 'moleculer-decorators';
import { UserType } from './users.service';
import { AppType } from './apps.service';

@Service({
  name: 'seed',
})
export default class SeedService extends moleculer.Service {
  @Action()
  async real(ctx: Context<Record<string, unknown>>) {
    // create apps
    await ctx.call('apps.create', {
      name: 'Admin',
      type: AppType.ADMIN,
      url: 'https://admin.biip.lt',
      settings: {
        productNameTo: 'BĮIP administravimo sistemos',
      },
    });
    
    await ctx.call('apps.create', {
      name: 'Vidiniai naudotojai',
      type: AppType.USERS,
      url: 'https://admin.biip.lt',
      settings: {
        productNameTo: 'BĮĮP naudotojų valdymo sistemos',
      },
    });

    // create local user
    await ctx.call('usersLocal.invite', {
      email: 'superadmin@am.lt',
      firstName: 'Super',
      lastName: 'Admin',
      password: 'Slaptazodis1@',
      phone: '+37060000000',
      type: UserType.SUPER_ADMIN,
      doNotSendEmail: true,
    });

    return true;
  }

  /**
   * Fake data
   * */
  @Action()
  async fake(ctx: Context<Record<string, unknown>>) {
    // return true;
  }

  @Action()
  run() {
    return this.broker
      .waitForServices(['users', 'usersLocal', 'apps', 'groups', 'permissions'])
      .then(async () => {
        const usersCount: number = await this.broker.call('users.count');

        if (usersCount === 0) {
          await this.broker.call('seed.real', {}, { timeout: 120 * 1000 });
        }
      });
  }
}
