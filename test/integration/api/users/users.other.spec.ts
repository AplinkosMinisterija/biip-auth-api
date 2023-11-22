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

describe("Test '/api/users' additional endpoints", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users';
  it('Gets logged in user info (super admin) in admin app', () => {
    return request(apiService.server)
      .get(endpoint + '/me')
      .set(apiHelper.getHeaders(apiHelper.superAdminToken))
      .expect(200)
      .expect((res: any) => {
        expect(res.body.id).toEqual(apiHelper.superAdmin.id);
      });
  });

  it('Gets logged in user info (admin) in admin app', () => {
    return request(apiService.server)
      .get(endpoint + '/me')
      .set(apiHelper.getHeaders(apiHelper.adminToken))
      .expect(200)
      .expect((res: any) => {
        expect(res.body.id).toEqual(apiHelper.admin.id);
      });
  });

  it('Gets logged in user info (fisher) in admin app', () => {
    return request(apiService.server)
      .get(endpoint + '/me')
      .set(apiHelper.getHeaders(apiHelper.fisherToken))
      .expect(401)
      .expect((res: any) => {
        expect(res.body.type).toEqual(errors.INVALID_TOKEN);
      });
  });

  it('Gets logged in user info (super admin) in fishing app', () => {
    return request(apiService.server)
      .get(endpoint + '/me')
      .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
      .expect(200)
      .expect((res: any) => {
        expect(res.body.id).toEqual(apiHelper.superAdmin.id);
      });
  });

  it('Gets logged in user info (admin) in fishing app', () => {
    return request(apiService.server)
      .get(endpoint + '/me')
      .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
      .expect(200)
      .expect((res: any) => {
        expect(res.body.id).toEqual(apiHelper.admin.id);
      });
  });

  it('Gets logged in user info (fisher) in fishing app', () => {
    return request(apiService.server)
      .get(endpoint + '/me')
      .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
      .expect(200)
      .expect((res: any) => {
        expect(res.body.id).toEqual(apiHelper.fisher.id);
      });
  });

  it('User logout', async () => {
    const res1 = await request(apiService.server)
      .post(endpoint + '/logout')
      .set(apiHelper.getHeaders(apiHelper.superAdminToken));
    expect(res1.body.success).toBeTruthy();
  });
});
