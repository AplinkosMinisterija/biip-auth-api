import { App, AppType } from '../../services/apps.service';
import { Group } from '../../services/groups.service';
import { UserGroupRole } from '../../services/userGroups.service';
import { User, UserType } from '../../services/users.service';
import { expect } from '@jest/globals';
import config from '../../moleculer.config';
import { BrokerOptions, ServiceBroker } from 'moleculer';
import faker from '@faker-js/faker';

const APISchema = require('../../services/api.service').default;
const AppsSchema = require('../../services/apps.service').default;
const AuthSchema = require('../../services/auth.service').default;
const GroupsSchema = require('../../services/groups.service').default;
const PermissionsSchema = require('../../services/permissions.service').default;
const UserGroupsSchema = require('../../services/userGroups.service').default;
const UsersSchema = require('../../services/users.service').default;
const UsersEvartaiSchema = require('../../services/usersEvartai.service').default;
const UsersLocalSchema = require('../../services/usersLocal.service').default;
const InheritedGroupAppsSchema = require('../../services/inheritedGroupApps.service').default;
const InheritedUserAppsSchema = require('../../services/inheritedUserApps.service').default;

const servicesWithTables = [
  'apps',
  'groups',
  'permissions',
  'userGroups',
  'users',
  'usersEvartai',
  'usersLocal',
];

export const serviceBrokerConfig: BrokerOptions = {
  ...config,
  ...{ logLevel: 'fatal' },
};

export const errors = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  BAD_REQUEST: 'BAD_REQUEST',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  NO_TOKEN: 'NO_TOKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_INVALID_PERSONAL_CODE: 'AUTH_INVALID_PERSONAL_CODE',
  AUTH_COMPANY_EXISTS: 'AUTH_COMPANY_EXISTS',
  AUTH_USER_ASSIGNED: 'AUTH_USER_ASSIGNED',
  AUTH_USER_EXISTS: 'AUTH_USER_EXISTS',
  APPS_OR_GROUPS_MISSING: 'APPS_OR_GROUPS_MISSING',
  NO_GROUPS: 'NO_GROUPS',
  INVALID_USER_TYPE: 'INVALID_USER_TYPE',
  INVALID_APPS: 'INVALID_APPS',
  INVALID_GROUPS: 'INVALID_GROUPS',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_TOKEN: 'INVALID_TOKEN',
};

export function testUpdatedData(res: any, data: any) {
  Object.keys(data).forEach((i: any) => {
    expect(res.body[i]).toEqual(data[i]);
  });
}

export function testListCountsAndIds(res: any, ids: Array<any>) {
  const itemsIds = res.body.rows.map((r: any) => r.id);

  expect(res.body.total).toEqual(ids.length);
  expect(itemsIds.length).toEqual(ids.length);
  expect(itemsIds).toEqual(expect.arrayContaining(ids));
}

export class ApiHelper {
  broker: ServiceBroker;

  appAdmin: App;
  appFishing: App;
  appHunting: App;
  appUsers: App;

  superAdmin: User;
  fisher: User;
  fisherUser: User;
  hunter: User;
  admin: User;
  adminInner: User;
  hunterEvartai: User;
  fisherEvartai: User;

  groupAdmin: Group;
  groupAdminInner: Group;
  groupFishers: Group;
  groupFishersCompany: Group;
  groupHuntersCompany: Group;
  groupAdminInner2: Group;
  groupHunters: Group;

  superAdminToken: string;
  fisherToken: string;
  fisherUserToken: string;
  adminToken: string;
  adminInnerToken: string;

  goodEmail = 'super.admin@am.lt';
  goodPassword = 'Slaptas123*';
  badEmail = 'superadmin@am';
  badPassword = 'Slaptas';
  emailFisher = 'user.fisher@am.lt';
  emailFisherUser = 'user.fisher2@am.lt';
  emailHunter = 'user.hunter@am.lt';
  emailAdmin = 'user.admin@am.lt';
  emailAdminInner = 'user.admin.inner@am.lt';

  companyCode = '874213437';

  constructor(broker: any) {
    this.broker = broker;
  }

  async setup() {
    await this.broker.waitForServices(['api', 'auth', ...servicesWithTables]);

    // remove all entities
    await Promise.all(
      servicesWithTables.map(async (s) => await this.broker.call(`${s}.removeAllEntities`)),
    );

    this.broker.cacher?.clean?.();

    this.appAdmin = await this.broker.call('apps.create', {
      name: 'AdminTest',
      type: AppType.ADMIN,
      url: faker.internet.url(),
      settings: {
        productNameTo: faker.lorem.word(2),
      },
    });
    this.appFishing = await this.broker.call('apps.create', {
      name: 'FishingTest',
      type: 'FISHING',
      url: faker.internet.url(),
      settings: {
        productNameTo: faker.lorem.word(2),
      },
    });
    this.appHunting = await this.broker.call('apps.create', {
      name: 'HuntingTest',
      type: 'HUNTING',
      url: faker.internet.url(),
      settings: {
        productNameTo: faker.lorem.word(2),
      },
    });
    this.appUsers = await this.broker.call('apps.create', {
      name: 'Users',
      type: AppType.USERS,
      url: faker.internet.url(),
      settings: {
        productNameTo: faker.lorem.word(2),
      },
    });

    this.groupAdmin = await this.broker.call('groups.create', {
      name: 'Group Admin',
      apps: [this.appAdmin.id, this.appFishing.id],
    });
    this.groupAdminInner = await this.broker.call('groups.create', {
      name: 'Group Admin Inner',
      parent: this.groupAdmin.id,
    });
    this.groupAdminInner2 = await this.broker.call('groups.create', {
      name: 'Group Admin Inner 2',
      parent: this.groupAdmin.id,
    });
    this.groupFishers = await this.broker.call('groups.create', {
      name: 'Group Fishers',
      apps: [this.appFishing.id],
    });
    this.groupHunters = await this.broker.call('groups.create', {
      name: 'Group Hunters',
      apps: [this.appHunting.id],
    });
    this.groupFishersCompany = await this.broker.call('groups.create', {
      name: 'Group Fishers Company',
      apps: [this.appFishing.id],
      companyCode: '997941705',
    });
    this.groupHuntersCompany = await this.broker.call('groups.create', {
      name: 'Group Hunters Company',
      apps: [this.appHunting.id],
      companyCode: '505063988',
    });

    this.superAdmin = await this.createUser(this.goodEmail, UserType.SUPER_ADMIN);
    this.fisher = await this.createUser(
      this.emailFisher,
      UserType.USER,
      [],
      [{ id: this.groupFishersCompany.id, role: UserGroupRole.ADMIN }],
    );
    this.fisherUser = await this.createUser(
      this.emailFisherUser,
      UserType.USER,
      [],
      [{ id: this.groupFishersCompany.id, role: UserGroupRole.USER }],
    );
    this.hunter = await this.createUser(this.emailHunter, UserType.USER, [this.appHunting.id]);
    this.admin = await this.createUser(
      this.emailAdmin,
      UserType.ADMIN,
      [],
      [{ id: this.groupAdmin.id, role: UserGroupRole.ADMIN }],
    );
    this.adminInner = await this.createUser(
      this.emailAdminInner,
      UserType.ADMIN,
      [],
      [{ id: this.groupAdminInner.id, role: UserGroupRole.ADMIN }],
    );
    this.fisherEvartai = await this.broker.call(
      'usersEvartai.invite',
      { personalCode: '91234567890' },
      { meta: { app: this.appFishing } },
    );
    this.hunterEvartai = await this.broker.call(
      'usersEvartai.invite',
      { personalCode: '91234567891' },
      { meta: { app: this.appHunting } },
    );

    this.superAdminToken = (await this.loginUser(this.goodEmail, this.goodPassword)).token;
    this.fisherToken = (
      await this.loginUser(this.emailFisher, this.goodPassword, false, this.appFishing)
    ).token;
    this.fisherUserToken = (
      await this.loginUser(this.emailFisherUser, this.goodPassword, false, this.appFishing)
    ).token;
    this.adminToken = (await this.loginUser(this.emailAdmin, this.goodPassword)).token;
    this.adminInnerToken = (await this.loginUser(this.emailAdminInner, this.goodPassword)).token;
  }

  getHeaders(token?: string | null, apiKey?: string | boolean) {
    const headers = {
      'X-Api-Key': `${apiKey === false ? '' : apiKey || this.appAdmin.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (token) {
      return { ...headers, Authorization: `Bearer ${token}` };
    }

    return headers;
  }

  initializeServices() {
    const apiService = this.broker.createService(APISchema);

    [
      AppsSchema,
      AuthSchema,
      GroupsSchema,
      PermissionsSchema,
      UserGroupsSchema,
      UsersSchema,
      UsersEvartaiSchema,
      UsersLocalSchema,
      InheritedGroupAppsSchema,
      InheritedUserAppsSchema,
    ].forEach((schema) => this.broker.createService(schema));

    return apiService;
  }

  loginUser = (
    email: string,
    password: string,
    refresh: boolean = false,
    app: App = this.appAdmin,
  ): Promise<any> => {
    return this.broker.call(
      'auth.login',
      {
        email: email,
        password: password,
        refresh,
      },
      { meta: { app } },
    );
  };

  createUser = (
    email: string,
    type?: UserType,
    apps?: Array<any>,
    groups?: Array<any>,
  ): Promise<User> => {
    return this.broker.call('usersLocal.invite', {
      email: email,
      firstName: 'User',
      lastName: 'TEST',
      apps: apps || [],
      groups: groups || [],
      password: this.goodPassword,
      type: type || UserType.USER,
    });
  };
}
