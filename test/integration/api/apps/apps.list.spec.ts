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

describe("Test GET '/api/apps'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/apps';

  describe('Acting as super admin', () => {
    it('Apps count equal to 3 in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [
            apiHelper.appAdmin.id,
            apiHelper.appFishing.id,
            apiHelper.appHunting.id,
          ]);
        });
    });

    it('Apps count equal to 3 in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [
            apiHelper.appAdmin.id,
            apiHelper.appFishing.id,
            apiHelper.appHunting.id,
          ]);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Apps count equal to 2 in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.appAdmin.id, apiHelper.appFishing.id]);
        });
    });

    it('Apps count equal to 2 in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.appAdmin.id, apiHelper.appFishing.id]);
        });
    });
  });

  describe('Acting as fisher', () => {
    it('Apps count not authorized in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Apps count equal to 1 in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.appFishing.id]);
        });
    });
  });
});
