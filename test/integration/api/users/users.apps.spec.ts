'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, serviceBrokerConfig } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals';
import { User, UserType } from '../../../../services/users.service';
import { UserGroupRole } from '../../../../services/userGroups.service';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

const initialize = async (broker: any) => {
  await broker.start();
  await apiHelper.setup();

  return true;
};

const createUser = (
  groupId?: any | any[],
  appId?: any,
  type?: UserType,
  email?: string,
): Promise<User> => {
  const createData: any = {
    firstName: 'Firstname',
    lastName: 'Lastname',
    type: type || UserType.ADMIN,
    email: email || `someemail${Math.floor(Math.random() * 1000)}@mail.com`,
  };

  if (groupId) {
    if (!Array.isArray(groupId)) {
      groupId = [groupId];
    }
    createData.groups = groupId.map((g: any) => ({
      id: g,
      role: UserGroupRole.USER,
    }));
  } else {
    createData.apps = [appId || apiHelper.appAdmin.id];
  }

  return broker.call('usersLocal.invite', createData, apiHelper.userLocalInviteMeta);
};

const createGroup = (apps?: any[]): Promise<User> => {
  const createData: any = {
    name: 'Group',
    apps,
  };

  return broker.call('groups.create', createData);
};

const removeUser = (id: any) => {
  return broker.call('users.removeUser', { id });
};

const getUser = (id: any): Promise<any> => {
  return broker.call('users.findOne', { query: { id }, populate: 'inheritedApps' });
};

const checkApps = async (id: any, apps: any[]) => {
  const user = await getUser(id);
  const userApps = user.inheritedApps;

  expect(userApps.length).toEqual(apps.length);

  apps.forEach((a) => {
    const foundApp = userApps.find((i: any) => i.id == a);
    expect(foundApp.id).toEqual(a);
  });
};

describe('Test inherited apps for users', () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users';

  it('Invite user, delete it & then reinvite (success)', async () => {
    const group = await createGroup([apiHelper.appAdmin.id, apiHelper.appFishing.id]);
    const user = await createUser(group.id);

    await checkApps(user.id, [apiHelper.appAdmin.id, apiHelper.appFishing.id]);

    await request(apiService.server)
      .delete(`${endpoint}/${user.id}`)
      .set(apiHelper.getHeaders(apiHelper.superAdminToken))
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toEqual(user.id);
      });

    const userNew = await createUser(null, apiHelper.appAdmin.id, undefined, user.email);

    await checkApps(userNew.id, [apiHelper.appAdmin.id]);

    return removeUser(userNew.id);
  });
});
