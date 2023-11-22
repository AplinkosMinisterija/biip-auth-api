'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig } from '../../helpers/api';
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

describe("Test endpoints' authorization", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  it("without authorized app - '/auth' unauthorized", () => {
    return request(apiService.server)
      .get('/auth/apps/me')
      .expect(401)
      .expect((res: any) => {
        expect(res.body.type).toEqual(errors.NO_TOKEN);
      });
  });

  it("with authorized app - '/auth' authorized", () => {
    return request(apiService.server)
      .get('/auth/apps/me')
      .set(apiHelper.getHeaders())
      .expect(200)
      .expect((res: any) => {
        expect(res.body.id).toEqual(apiHelper.appAdmin.id);
      });
  });

  it("without authorized app - '/api' unauthorized", () => {
    return request(apiService.server)
      .get('/api/users/me')
      .expect(401)
      .expect((res: any) => {
        expect(res.body.type).toEqual(errors.NO_TOKEN);
      });
  });

  it("with authorized app - '/api' unauthorized (no user)", () => {
    return request(apiService.server)
      .get('/api/users/me')
      .set(apiHelper.getHeaders())
      .expect(401)
      .expect((res: any) => {
        expect(res.body.type).toEqual(errors.NO_TOKEN);
      });
  });
});
