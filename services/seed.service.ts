'use strict';

import moleculer, { Context } from 'moleculer';
import { Action, Service } from 'moleculer-decorators';
import { UserType } from './users.service';
import { AppType } from './apps.service';
import { Group } from './groups.service';
const fs = require('fs');

@Service({
  name: 'seed',
})
export default class SeedService extends moleculer.Service {
  @Action()
  async real(ctx: Context<Record<string, unknown>>) {
    // create apps
    const appsToCreate = [
      {
        name: 'Žuvinimas',
        type: AppType.FISH_STOCKING,
        url: 'https://zuvinimas.biip.lt',
        settings: {
          productNameTo: 'BĮĮP įžuvinimo sistemos',
        },
      },
      {
        name: 'Medžioklė',
        type: AppType.HUNTING,
        url: 'https://medziokle.biip.lt',
        settings: {
          productNameTo: 'BĮĮP medžioklės sistemos',
        },
      },
      {
        name: 'Rūšių stebėjimas',
        type: AppType.SPECIES,
        url: 'https://rusys.biip.lt',
        settings: {
          productNameTo: 'BĮĮP rūšių stebėjimo sistemos',
        },
      },
      {
        name: 'Žvejyba',
        type: AppType.FISHING,
        url: 'https://zvejyba.biip.lt',
        settings: {
          productNameTo: 'BĮĮP žvejybos sistemos',
        },
      },
      {
        name: 'Admin',
        type: AppType.ADMIN,
        url: 'https://admin.biip.lt',
        settings: {
          productNameTo: 'BĮĮP administravimo sistemos',
        },
      },
      {
        name: 'Vidiniai naudotojai',
        type: AppType.USERS,
        url: 'https://admin.biip.lt',
        settings: {
          productNameTo: 'BĮĮP naudotojų valdymo sistemos',
        },
      },
    ];
    const createdApps = await Promise.all(appsToCreate.map((app) => ctx.call('apps.create', app)));
    const apps: any = createdApps.reduce((acc: any, app: any) => ({ ...acc, [app.type]: app }), {});

    // create local user
    await ctx.call('usersLocal.invite', {
      email: 'superadmin@am.lt',
      firstName: 'Super',
      lastName: 'Admin',
      password: 'Slaptazodis1@',
      phone: '+37060000000',
      type: UserType.SUPER_ADMIN,
    });

    const AADGroup: Group = await ctx.call('groups.create', {
      name: 'AAD',
      apps: [
        apps[AppType.FISHING].id,
        apps[AppType.FISH_STOCKING].id,
        apps[AppType.HUNTING].id,
        apps[AppType.ADMIN].id,
      ],
    });
    await ctx.call('groups.create', {
      name: 'Vilniaus valdyba',
      parent: AADGroup.id,
    });
    await ctx.call('groups.create', {
      name: 'Kauno valdyba',
      parent: AADGroup.id,
    });
    await ctx.call('groups.create', {
      name: 'Klaipėdos valdyba',
      parent: AADGroup.id,
    });
    await ctx.call('groups.create', {
      name: 'SRIS',
      apps: [apps[AppType.SPECIES].id, apps[AppType.ADMIN].id],
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

  // async started(): Promise<void> {
  //   this.broker
  //     .waitForServices(['users', 'usersLocal', 'apps', 'groups'])
  //     .then(async () => {
  //       const usersCount: number = await this.broker.call('users.count');

  //       if (usersCount === 0) {
  //         await this.broker.call('seed.real', {}, { timeout: 120 * 1000 });
  //       }
  //     });
  // }
}
