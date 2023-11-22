'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig, testUpdatedData } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

const initialize = async (broker: any) => {
  await broker.start();
  await apiHelper.setup();

  return true;
};

const getDataForUpdate = (data?: any) => {
  return {
    firstName: 'User ' + Math.floor(Math.random() * 1000),
    ...data,
  };
};

describe("Test PATCH '/api/users/:id'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users';

  describe('Acting as super admin', () => {
    it('Update self in admin app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.superAdmin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update self in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.superAdmin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update admin in admin app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update admin in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update fisher in admin app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Update fisher in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.fisher.id);
          testUpdatedData(res, dataForUpdate);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Update self in admin app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update self in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update super admin in admin app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Update super admin in fishing app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Update fisher in admin app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Update fisher in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.fisher.id);
          testUpdatedData(res, dataForUpdate);
        });
    });
  });

  describe('Acting as fisher', () => {
    it('Update self in admin app (invalid token)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Update self in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.fisher.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update super admin in admin app (invalid token)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Update super admin in fishing app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Update admin in admin app (invalid token)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Update admin in fishing app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Update fisher (user) to company admin in fishing app', async () => {
      const dataForUpdate = getDataForUpdate({
        groups: [{ id: apiHelper.groupFishersCompany.id, role: 'ADMIN' }],
      });
      const dataForRevert = getDataForUpdate({
        groups: [{ id: apiHelper.groupFishersCompany.id, role: 'USER' }],
      });

      await request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisherUser.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
        });

      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisherUser.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForRevert);
    });

    it('Update fisher user apps in fishing app', () => {
      const dataForUpdate = getDataForUpdate({
        apps: [apiHelper.appHunting.id],
      });
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.fisherUser.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(422)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_APPS);
        });
    });
  });
});
