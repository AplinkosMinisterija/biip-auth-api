'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig } from '../../../helpers/api';
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

describe("Test GET '/api/groups/:id'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/groups';

  describe('Acting as super admin', () => {
    it('Get admin group in admin app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
        });
    });

    it('Get inner admin group in admin app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
        });
    });

    it('Get fishers group in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get admin group in fishing app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
        });
    });

    it('Get inner admin group in fishing app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
        });
    });

    it('Get fishers group in fishing app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupFishers.id);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Get admin group in admin app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
        });
    });

    it('Get inner admin group in admin app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
        });
    });

    it('Get fishers group in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get admin group in fishing app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdmin.id);
        });
    });

    it('Get inner admin group in fishing app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.groupAdminInner.id);
        });
    });

    it('Get fishers group in fishing app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });
  });

  describe('Acting as fisher', () => {
    it('Get admin group in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Get inner admin group in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Get fishers group in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Get admin group in fishing app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get inner admin group in fishing app (success)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupAdminInner.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get fishers group in fishing app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.groupFishers.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });
  });
});
