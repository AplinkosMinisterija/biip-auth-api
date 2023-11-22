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

describe("Test GET '/api/groups'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/groups';
  const queryForParent = () => {
    return {
      query: {
        parent: apiHelper.groupAdmin.id,
      },
    };
  };

  describe('Acting as super admin', () => {
    it('Groups count equal to 1 (admin group) in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdmin.id]);
        });
    });

    it('Groups count equal to 2 (admin group, fishers group) in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdmin.id, apiHelper.groupFishers.id]);
        });
    });

    it('Groups count equal to 2 (admin inner groups) with parent in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .query(queryForParent())
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdminInner.id, apiHelper.groupAdminInner2.id]);
        });
    });

    it('Groups count equal to 2 (admin inner groups) with parent in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .query(queryForParent())
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdminInner.id, apiHelper.groupAdminInner2.id]);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Groups count equal to 1 (admin group) in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdmin.id]);
        });
    });

    it('Groups count equal to 1 (admin group) in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdmin.id]);
        });
    });

    it('Groups count equal to 2 (admin inner groups) with parent in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .query(queryForParent())
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdminInner.id, apiHelper.groupAdminInner2.id]);
        });
    });

    it('Groups count equal to 2 (admin inner groups) with parent in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .query(queryForParent())
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.groupAdminInner.id, apiHelper.groupAdminInner2.id]);
        });
    });
  });

  describe('Acting as fisher', () => {
    it('Groups invalid token in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });

    it('Groups count equal to 0 in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, []);
        });
    });

    it('Groups count equal to 0 with parent in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .query(queryForParent())
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, []);
        });
    });

    it('Groups count equal to 0 with parent in admin app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken))
        .query(queryForParent())
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.INVALID_TOKEN);
        });
    });
  });
});
