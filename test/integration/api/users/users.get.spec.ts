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

describe("Test GET '/api/users/:id'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users';

  describe('Acting as super admin', () => {
    it('Get self in admin app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.superAdmin.id);
        });
    });

    it('Get self in fishing app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.superAdmin.id);
        });
    });

    it('Get fisher in fishing app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.fisher.id);
        });
    });

    it('Get fisher in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get admin in fishing app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
        });
    });

    it('Get admin in admin app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Get self in admin app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
        });
    });

    it('Get self in fishing app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.admin.id);
        });
    });

    it('Get fisher in fishing app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.fisher.id);
        });
    });

    it('Get fisher in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get super admin in admin app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get super admin in fishing app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });
  });

  describe('Acting as fisher', () => {
    it('Get self in admin app (unauthorized)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Get self in fishing app (found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.fisher.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.fisher.id);
        });
    });

    it('Get admin in fishing app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get admin in admin app (unauthorized)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.admin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Get super admin in fishing app (not found)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Get super admin in admin app (unauthorized)', () => {
      return request(apiService.server)
        .get(`${endpoint}/${apiHelper.superAdmin.id}`)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });
  });
});
