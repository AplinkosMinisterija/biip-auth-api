'use strict';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { companyCode, personalCode } from 'lt-codes';
import { ServiceBroker } from 'moleculer';
import { UserGroupRole } from '../../../../services/userGroups.service';
import { UserType } from '../../../../services/users.service';
import { ApiHelper, errors, serviceBrokerConfig, testUpdatedData } from '../../../helpers/api';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

const initialize = async (broker: any) => {
  await broker.start();
  await apiHelper.setup();

  return true;
};

const getInviteGroupData = () => ({ companyCode: companyCode.generate() });

const getInviteUserData = (additionalData = {}) => ({
  personalCode: personalCode.generate(),
  ...additionalData,
});

const removeUser = (id: string) => {
  return broker.call('users.removeUser', { id });
};

const removeGroup = (id: string) => {
  return broker.call('groups.remove', { id });
};
const getUser = (id: any): Promise<any> => {
  return broker.call('users.findOne', { query: { id }, populate: 'groups' });
};

const getDataForCreate = (data = {}) => {
  return {
    firstName: 'Firstname',
    lastName: 'Lastname',
    email: `someemail${Math.floor(Math.random() * 1000)}@mail.com`,
    ...data,
  };
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

describe("Test POST '/api/users'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users';
  const inviteEndpoint = endpoint + '/invite';

  describe('Acting as super admin', () => {
    it('Create super admin in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.SUPER_ADMIN,
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeUser(res.body.id);
    });

    it('Create admin with group in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send({
          ...createData,
          groups: [{ id: apiHelper.groupAdmin.id, role: UserGroupRole.USER }],
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeUser(res.body.id);
    });

    it('Create admin without groups and apps in admin app (bad request)', () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(createData)
        .expect(422)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.APPS_OR_GROUPS_MISSING);
        });
    });

    it('Create admin with app in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
        apps: [apiHelper.appAdmin.id],
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeUser(res.body.id);
    });

    it('Invite a group with its admin (success)', async () => {
      const groupResponse = await request(apiService.server)
        .post(inviteEndpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(getInviteGroupData())
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
        });

      const groupId = groupResponse?.body?.id;

      const groupAdminResponse: any = await request(apiService.server)
        .post(inviteEndpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(getInviteUserData({ role: UserType.ADMIN, companyId: groupId }))
        .expect(200)
        .expect((res: any) => {
          expect(res.body?.role).toEqual(UserType.ADMIN);
        });

      const userId = groupAdminResponse?.body?.id;

      await removeGroup(groupId);

      await request(apiService.server)
        .delete(`${endpoint}/${userId}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200);
    });

    it('Invite a group with its user (success)', async () => {
      const groupResponse = await request(apiService.server)
        .post(inviteEndpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(getInviteGroupData())
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
        });

      const groupId = groupResponse?.body?.id;

      const groupUserResponse: any = await request(apiService.server)
        .post(inviteEndpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(getInviteUserData({ companyId: groupId }))
        .expect(200)
        .expect((res: any) => {
          expect(res.body?.role).toEqual(UserType.USER);
        });

      const userId = groupUserResponse?.body?.id;

      await removeGroup(groupId);
      await request(apiService.server)
        .delete(`${endpoint}/${userId}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200);
    });

    it('Invite an user (success)', async () => {
      const UserResponse: any = await request(apiService.server)
        .post(inviteEndpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(getInviteUserData())
        .expect(200)
        .expect((res: any) => {
          expect(res.body?.role).toEqual(undefined);
        });

      const userId = UserResponse?.body?.id;

      await request(apiService.server)
        .delete(`${endpoint}/${userId}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200);
    });

    it('Create admin with groups (without unassigning) in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
      });

      const group1 = { id: apiHelper.groupAdminInner.id, role: UserGroupRole.USER };
      const group2 = { id: apiHelper.groupAdminInner2.id, role: UserGroupRole.USER };
      const res1 = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send({
          ...createData,
          groups: [group1],
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      checkGroups(res1.body.id, [group1]);

      const res2 = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send({
          ...createData,
          groups: [group2],
          unassignExistingGroups: false,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });
      expect(res1.body.id).toEqual(res2.body.id);
      checkGroups(res2.body.id, [group1, group2]);

      return removeUser(res1.body.id);
    });

    it('Create admin with groups (with unassigning) in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
      });

      const group1 = { id: apiHelper.groupAdminInner.id, role: UserGroupRole.USER };
      const group2 = { id: apiHelper.groupAdminInner2.id, role: UserGroupRole.USER };
      const res1 = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send({
          ...createData,
          groups: [group1],
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      checkGroups(res1.body.id, [group1]);

      const res2 = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send({
          ...createData,
          groups: [group2],
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      expect(res1.body.id).toEqual(res2.body.id);
      checkGroups(res2.body.id, [group2]);

      return removeUser(res1.body.id);
    });
  });

  describe('Acting as admin', () => {
    it('Create super admin in admin app (unauthorized)', () => {
      const createData = getDataForCreate({
        type: UserType.SUPER_ADMIN,
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(createData)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Create admin with group in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send({
          ...createData,
          groups: [{ id: apiHelper.groupAdmin.id, role: UserGroupRole.USER }],
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeUser(res.body.id);
    });

    it('Create admin with app in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
        apps: [apiHelper.appAdmin.id],
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeUser(res.body.id);
    });
  });

  describe('Acting as inner admin', () => {
    it('Create admin with admin group in admin app (unauthorized)', () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .send({
          ...createData,
          groups: [{ id: apiHelper.groupAdmin.id, role: UserGroupRole.USER }],
        })
        .expect(422)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_GROUPS);
        });
    });

    it('Create admin with inner admin group in admin app (success)', async () => {
      const createData = getDataForCreate({
        type: UserType.ADMIN,
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .send({
          ...createData,
          groups: [{ id: apiHelper.groupAdminInner.id, role: UserGroupRole.USER }],
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeUser(res.body.id);
    });
  });

  describe('Acting as fisher', () => {
    it('Create fisher (user) as company admin in fishing app', async () => {
      const createData = getDataForCreate({
        groups: [{ id: apiHelper.groupFishersCompany.id }],
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
        });

      return removeUser(res.body.id);
    });

    it('Create fisher (admin) as company admin in fishing app', async () => {
      const createData = getDataForCreate({
        groups: [{ id: apiHelper.groupFishersCompany.id, role: 'ADMIN' }],
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
        });

      return removeUser(res.body.id);
    });

    it('Create fisher (user) as company user in fishing app (invalid groups)', () => {
      const createData = getDataForCreate({
        groups: [{ id: apiHelper.groupFishersCompany.id }],
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherUserToken, apiHelper.appFishing.apiKey))
        .send(createData)
        .expect(422)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_GROUPS);
        });
    });

    it('Create independant fisher in fishing app (no groups)', () => {
      const createData = getDataForCreate({
        apps: [apiHelper.appFishing.id],
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(createData)
        .expect(422)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NO_GROUPS);
        });
    });
  });

  describe('Creating without token', () => {
    it('Create user in app where user cannot invite self (fail)', () => {
      const createData = getDataForCreate({
        groups: [{ id: apiHelper.groupFishersCompany.id, role: 'USER' }],
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send(createData)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NO_TOKEN);
        });
    });

    it('Create user in app where user can invite self (success)', () => {
      const createData = getDataForCreate({
        groups: [{ id: apiHelper.groupSelfUsers.id, role: 'USER' }],
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(null, apiHelper.appSelfUsers.apiKey))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
        });
    });
  });
});
