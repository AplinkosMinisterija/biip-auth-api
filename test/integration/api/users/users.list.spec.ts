'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig, testListCountsAndIds } from '../../../helpers/api';
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

describe("Test GET '/api/users'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users';
  describe('Acting as super admin', () => {
    it('Users count equal to 3 (super admin, admin, admin inner) in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [
            apiHelper.superAdmin.id,
            apiHelper.admin.id,
            apiHelper.adminInner.id,
          ]);
        });
    });

    it('Users count equal to 3 (fishers) in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [
            apiHelper.fisher.id,
            apiHelper.fisherEvartai.id,
            apiHelper.fisherUser.id,
          ]);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Users count equal to 2 (admin, admin inner) in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.admin.id, apiHelper.adminInner.id]);
        });
    });

    it('Users count equal to 3 (fishers) in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [
            apiHelper.fisher.id,
            apiHelper.fisherEvartai.id,
            apiHelper.fisherUser.id,
          ]);
        });
    });
  });

  describe('Acting as fisher', () => {
    it('Users count in admin app (invalid token)', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Users count equal to 2 (fishers in company) in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.fisher.id, apiHelper.fisherUser.id]);
        });
    });
  });
});
