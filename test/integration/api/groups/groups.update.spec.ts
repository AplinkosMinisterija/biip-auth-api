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

const getDataForUpdate = () => {
  return {
    name: 'Group ' + Math.floor(Math.random() * 1000),
  };
};

describe("Test PATCH '/api/groups/:id'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/groups';

  describe('Acting as super admin', () => {
    it('Update inner admin group in admin app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update admin group in admin app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update inner admin group in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update admin group in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update fishers group in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupFishers.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update admin group in admin app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Update inner admin group in admin app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update admin group in admin app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update inner admin group in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update admin group in fishing app (success)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
          testUpdatedData(res, dataForUpdate);
        });
    });

    it('Update fishers group in fishing app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Update admin group in admin app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });
  });

  describe('Acting as fisher', () => {
    it('Update inner admin group in admin app (invalid token)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Update admin group in admin app (invalid token)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Update inner admin group in fishing app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Update admin group in fishing app (unauthorized)', () => {
      const dataForUpdate = getDataForUpdate();
      return request(apiService.server)
        .patch(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send(dataForUpdate)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });
  });
});
