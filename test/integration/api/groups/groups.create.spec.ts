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

const removeGroup = (id: string) => {
  return broker.call('groups.remove', { id });
};

const getDataForCreate = (data = {}) => {
  return {
    name: 'Group ' + Math.floor(Math.random() * 1000),
    ...data,
  };
};

describe("Test POST '/api/groups'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/groups';

  describe('Acting as super admin', () => {
    it('Create group without apps in admin app (bad request)', () => {
      const createData = getDataForCreate();
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(createData)
        .expect(400)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.BAD_REQUEST);
        });
    });

    it('Create group with apps in admin app (success)', async () => {
      const createData = getDataForCreate({
        apps: [apiHelper.appAdmin.id],
      });
      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeGroup(res.body.id);
    });

    it('Create group with parent in admin app (success)', async () => {
      const createData = getDataForCreate({
        parent: apiHelper.groupAdmin.id,
      });

      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeGroup(res.body.id);
    });
  });

  describe('Acting as admin', () => {
    it('Create group without apps in admin app (bad request)', () => {
      const createData = getDataForCreate();
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(createData)
        .expect(400)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.BAD_REQUEST);
        });
    });

    it('Create group with apps without parent in admin app (unauthorized)', () => {
      const createData = getDataForCreate({
        apps: [apiHelper.appAdmin.id],
      });
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(createData)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Create group with parent in admin app (success)', async () => {
      const createData = getDataForCreate({
        parent: apiHelper.groupAdmin.id,
      });

      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeGroup(res.body.id);
    });
  });

  describe('Acting as inner admin', () => {
    it('Create group with parent in admin app (unauthorized)', () => {
      const createData = getDataForCreate({
        parent: apiHelper.groupAdmin.id,
      });

      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .send(createData)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });

    it('Create group with parent in admin app (success)', async () => {
      const createData = getDataForCreate({
        parent: apiHelper.groupAdminInner.id,
      });

      const res = await request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .send(createData)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toBeUndefined();
          testUpdatedData(res, createData);
        });

      return removeGroup(res.body.id);
    });
  });

  describe('Acting as fisher', () => {
    it('Create group with parent in fishing app (unauthorized)', () => {
      const createData = getDataForCreate({
        parent: apiHelper.groupFishersCompany.id,
      });

      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .send(createData)
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });
    });
  });
});
