'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig } from '../../../helpers/api';
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

const createGroup = (appId?: any | any[], parent?: any, companyCode?: any): Promise<User> => {
  const createData: any = {
    name: `Group ${Math.floor(Math.random() * 1000)}`,
    parent,
  };
  if (appId) {
    createData.apps = Array.isArray(appId) ? appId : [appId];
  }
  if (companyCode) {
    createData.companyCode = companyCode;
  }

  return broker.call('groups.create', createData);
};

const removeGroup = (id: any) => {
  return broker.call('groups.remove', { id });
};

describe("Test DELETE '/api/groups/:id'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/groups';

  describe('Acting as super admin', () => {
    it('Delete group in admin app (success)', async () => {
      const group = await createGroup(apiHelper.appAdmin.id);

      return request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(group.id);
        });
    });

    it('Delete fishers group in admin app (unauthorized)', async () => {
      const group = await createGroup(apiHelper.appFishing.id);

      await request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeGroup(group.id);
    });

    it('Delete fishers group in fishing app (success)', async () => {
      const group = await createGroup(apiHelper.appFishing.id);

      return request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(group.id);
        });
    });

    it('Delete group by moving users to other group', async () => {
      const group = await createGroup(apiHelper.appFishing.id);
      const group2 = await createGroup(apiHelper.appFishing.id);

      await apiHelper.createUser(
        'someuseremail@email.com',
        UserType.USER,
        [apiHelper.appFishing.id],
        [{ role: UserGroupRole.USER, id: group.id }],
      );

      await request(apiService.server)
        .get(`${endpoint}/${group.id}?populate=users`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body?.users?.length).toEqual(1);
        });

      await request(apiService.server)
        .get(`${endpoint}/${group2.id}?populate=users`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body?.users?.length).toEqual(0);
        });

      await request(apiService.server)
        .delete(`${endpoint}/${group.id}?moveToGroup=${group2.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200);

      await request(apiService.server)
        .get(`${endpoint}/${group2.id}?populate=users`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body?.users?.length).toEqual(1);
        });

      await removeGroup(group2.id);
    });

    it('Delete group by moving users to other group (different app) (unauthorized)', async () => {
      const group1 = await createGroup(apiHelper.appFishing.id);
      const group2 = await createGroup(apiHelper.appHunting.id);

      await request(apiService.server)
        .delete(`${endpoint}/${group1.id}?moveToGroup=${group2.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(401);

      await removeGroup(group1.id);
      await removeGroup(group2.id);
    });
  });

  describe('Acting as admin', () => {
    it('Delete group in admin app (unauthorized)', async () => {
      const group = await createGroup(apiHelper.appAdmin.id);

      await request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeGroup(group.id);
    });

    it('Delete fishers group in admin app (unauthorized)', async () => {
      const group = await createGroup(apiHelper.appFishing.id);

      await request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeGroup(group.id);
    });

    it('Delete fishers group in fishing app (unauthorized)', async () => {
      const group = await createGroup(apiHelper.appFishing.id);

      await request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeGroup(group.id);
    });

    it('Delete inner admin group in admin app (success)', async () => {
      const group = await createGroup(null, apiHelper.groupAdmin.id);

      return request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(group.id);
        });
    });

    it('Delete inner inner admin group in admin app (success)', async () => {
      const group = await createGroup(null, apiHelper.groupAdminInner.id);

      return request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(group.id);
        });
    });
  });

  describe('Acting as inner admin', () => {
    it('Delete inner admin group in admin app (unauthorized)', async () => {
      const group = await createGroup(null, apiHelper.groupAdmin.id);

      await request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeGroup(group.id);
    });

    it('Delete inner inner admin group in admin app (success)', async () => {
      const group = await createGroup(null, apiHelper.groupAdminInner.id);

      return request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(group.id);
        });
    });
  });

  describe('Deleting groups with serveral apps', () => {
    it('Delete company from one app, but exists in other', async () => {
      const group = await createGroup(
        [apiHelper.appFishing.id, apiHelper.appHunting.id],
        null,
        apiHelper.companyCode,
      );

      await request(apiService.server)
        .delete(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200);

      await request(apiService.server)
        .get(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(404);

      await request(apiService.server)
        .get(`${endpoint}/${group.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
        .expect(200);

      return removeGroup(group.id);
    });
  });
});
