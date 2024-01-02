'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it, afterEach } from '@jest/globals';
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

const getUser = (id: any): Promise<any> => {
  return broker.call('users.findOne', { query: { id }, populate: 'groups' });
};

const checkGroups = async (id: any, groups: Array<any>) => {
  const user = await getUser(id);
  const userGroups = user.groups;
  groups.forEach((g) => {
    const foundGroup = userGroups.find((i: any) => i.id == g.id);
    expect(foundGroup.id).toEqual(g.id);
    expect(foundGroup.role).toEqual(g.role);
  });
};

describe('Test assigning groups to user', () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const groupToAssign1 = () => ({ id: apiHelper.groupAdminInner.id, role: UserGroupRole.ADMIN });
  const groupToAssign2 = () => ({ id: apiHelper.groupAdminInner2.id, role: UserGroupRole.USER });

  afterEach(async () => {
    await broker.call('usersLocal.updateUser', {
      id: apiHelper.adminInner.id,
      groups: [groupToAssign1()],
      apps: [],
    });

    await broker.call('usersLocal.updateUser', {
      id: apiHelper.hunter.id,
      groups: [],
      apps: [apiHelper.appHunting.id],
    });
  });

  const endpoint = '/api/users';
  const groupsToAssign = () => {
    return [groupToAssign1(), groupToAssign2()];
  };

  it('Assign groups for inner admin acting as admin (success)', async () => {
    return request(apiService.server)
      .patch(`${endpoint}/${apiHelper.adminInner.id}`)
      .set(apiHelper.getHeaders(apiHelper.adminToken))
      .send({
        groups: groupsToAssign(),
      })
      .expect(200)
      .expect(async (res: any) => {
        await checkGroups(apiHelper.adminInner.id, groupsToAssign());
      });
  });

  it('Assign groups (with unassign) for inner admin acting as admin (success)', async () => {
    return request(apiService.server)
      .patch(`${endpoint}/${apiHelper.adminInner.id}`)
      .set(apiHelper.getHeaders(apiHelper.adminToken))
      .send({
        groups: [groupToAssign2()],
      })
      .expect(200)
      .expect(async (res: any) => {
        await checkGroups(apiHelper.adminInner.id, [groupToAssign2()]);
      });
  });

  it('Assign groups (without unassign) for inner admin acting as admin (success)', async () => {
    return request(apiService.server)
      .patch(`${endpoint}/${apiHelper.adminInner.id}`)
      .set(apiHelper.getHeaders(apiHelper.adminToken))
      .send({
        groups: [groupToAssign2()],
        unassignExistingGroups: false,
      })
      .expect(200)
      .expect(async (res: any) => {
        await checkGroups(apiHelper.adminInner.id, [groupToAssign1(), groupToAssign2()]);
      });
  });

  it('Assign groups for inner admin acting as inner admin (unauthorized)', async () => {
    return request(apiService.server)
      .patch(`${endpoint}/${apiHelper.adminInner.id}`)
      .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
      .send({
        groups: groupsToAssign(),
      })
      .expect(422)
      .expect((res: any) => {
        expect(res.body.type).toEqual(errors.INVALID_GROUPS);
      });
  });

  it('Unassign groups for inner admin acting as admin (bad request - no apps & groups)', async () => {
    return request(apiService.server)
      .patch(`${endpoint}/${apiHelper.adminInner.id}`)
      .set(apiHelper.getHeaders(apiHelper.adminToken))
      .send({
        groups: [],
      })
      .expect(422)
      .expect((res: any) => {
        expect(res.body.type).toEqual(errors.APPS_OR_GROUPS_MISSING);
      });
  });

  it('Unassign groups for inner admin acting as admin (success)', async () => {
    return request(apiService.server)
      .patch(`${endpoint}/${apiHelper.adminInner.id}`)
      .set(apiHelper.getHeaders(apiHelper.adminToken))
      .send({
        groups: [],
        apps: [apiHelper.appAdmin.id],
      })
      .expect(200)
      .expect(async (res: any) => {
        await checkGroups(apiHelper.adminInner.id, []);
      });
  });

  it('Unassign apps for hunter and assigning group acting as admin (success)', async () => {
    const groupHunters = {
      id: apiHelper.groupHunters.id,
      role: UserGroupRole.USER,
    };
    return request(apiService.server)
      .patch(`${endpoint}/${apiHelper.hunter.id}`)
      .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
      .send({
        groups: [groupHunters],
        apps: [],
      })
      .expect(200)
      .expect(async (res: any) => {
        await checkGroups(apiHelper.hunter.id, [groupHunters]);
      });
  });
});
