'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig, testUpdatedData } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals';
import { UserType } from '../../../../services/users.service';
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

const removeUser = (id: string) => {
  return broker.call('users.removeUser', { id });
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
});
