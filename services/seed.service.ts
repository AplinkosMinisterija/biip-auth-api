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
    const adminEmail = process.env.DEFAULT_SUPER_ADMIN_EMAIL;
    const adminPassword = process.env.DEFAULT_SUPER_ADMIN_PASSWORD;
    const adminAppUrl = process.env.DEFAULT_ADMIN_APP_URL || 'https://admin.biip.lt';
    const projectNameGenitive = process.env.DEFAULT_PROJECT_NAME_GENITIVE || 'BĮIP';

    if (!adminEmail || !adminPassword) {
      // Bootstrap the first super admin from env, never from a hardcoded
      // default. The previous fallback ('superadmin@am.lt' / 'Slaptazodis1@')
      // was a known credential pair — anyone scanning a fresh deploy where
      // the env vars hadn't been set could log in as super admin.
      throw new moleculer.Errors.MoleculerServerError(
        'DEFAULT_SUPER_ADMIN_EMAIL and DEFAULT_SUPER_ADMIN_PASSWORD must be set before seeding.',
        500,
        'SEED_CONFIG_MISSING',
      );
    }
    const adminAppExists = await ctx.call('apps.count', { query: { type: AppType.ADMIN } });
    const usersAppExists = await ctx.call('apps.count', { query: { type: AppType.USERS } });
    const userExists = await ctx.call('users.count', { query: { email: adminEmail } });

    if (!adminAppExists) {
      // create admin app
      await ctx.call('apps.create', {
        name: 'Admin',
        type: AppType.ADMIN,
        url: adminAppUrl,
        settings: {
          productNameTo: `${projectNameGenitive} administravimo sistemos`,
        },
      });
    }

    if (!usersAppExists) {
      // create users app
      await ctx.call('apps.create', {
        name: 'Vidiniai naudotojai',
        type: AppType.USERS,
        url: adminAppUrl,
        settings: {
          productNameTo: `${projectNameGenitive} naudotojų valdymo sistemos`,
        },
      });
    }

    if (!userExists) {
      // create super admin user
      await ctx.call(
        'usersLocal.invite',
        {
          email: adminEmail,
          firstName: 'Super',
          lastName: 'Admin',
          password: adminPassword,
          phone: '+37060000000',
          type: UserType.SUPER_ADMIN,
          doNotSendEmail: true,
        },
        {
          meta: {
            hasPermissions: true,
          },
        },
      );
    }

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
        const appsCount: number = await this.broker.call('apps.count');

        if (!usersCount || !appsCount) {
          await this.broker.call('seed.real', {}, { timeout: 120 * 1000 });
        }
      });
  }
}
