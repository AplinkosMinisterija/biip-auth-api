'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals';
import { faker } from '@faker-js/faker';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

const initialize = async (broker: any) => {
  await broker.start();
  await apiHelper.setup();

  return true;
};

const validationErrorValidateFields = (res: any, fieldsToCheck: Array<string>) => {
  const fields = res.body.data.map((d: any) => d.field);

  expect(res.body.type).toEqual(errors.VALIDATION_ERROR);
  expect(fields.length).toEqual(fieldsToCheck.length);
  expect(fields).toEqual(expect.arrayContaining(fieldsToCheck));
};

const getUserData = () => ({
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: faker.internet.email().toLowerCase(),
  phone: faker.phone.number({ style: 'international' }),
});

const resetUserData = (id?: string | number) => {
  if (!id) return;

  return broker.call('users.update', {
    id,
    firstName: null,
    email: null,
    lastName: null,
    phone: null,
  });
};

const validateUserFields = (res: any, apiKey?: string, newUserData: any = {}) => {
  const token = res.body.token;

  return request(apiService.server)
    .get('/api/users/me')
    .set(apiHelper.getHeaders(token, apiKey))
    .expect(200)
    .expect((res: any) => {
      const user = res.body;
      Object.keys(newUserData).forEach((key) => {
        expect(newUserData[key]).toEqual(user[key]);
      });
    });
  apiHelper;
};

describe("Test '/auth' endpoints", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  describe("Test '/auth/evartai/sign' endpoint", () => {
    const evartaiSignEndpoint = '/auth/evartai/sign';

    it('Without host', () => {
      return request(apiService.server)
        .post(evartaiSignEndpoint)
        .set(apiHelper.getHeaders())
        .expect(422)
        .expect((res: any) => {
          validationErrorValidateFields(res, ['host']);
        });
    });
  });

  describe("Test '/auth/evartai/login' endpoint", () => {
    const evartaiLoginEndpoint = '/auth/evartai/login';

    it('Logins successfully', () => {
      apiHelper.interceptFetch({ personalCode: apiHelper.fisherEvartai.personalCode });

      return request(apiService.server)
        .post(evartaiLoginEndpoint)
        .send({
          ticket: faker.lorem.word(),
        })
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect(async (res: any) => {
          await validateUserFields(res, apiHelper.appFishing.apiKey, {
            id: apiHelper.fisherEvartai.id,
          });
        });
    });

    it('Checks changed info', async () => {
      const interceptedFields = getUserData();
      apiHelper.interceptFetch({
        personalCode: apiHelper.fisherEvartai.personalCode,
        ...interceptedFields,
      });
      const res = await request(apiService.server)
        .post(evartaiLoginEndpoint)
        .send({
          ticket: faker.lorem.word(),
        })
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .expect(200);

      await validateUserFields(res, apiHelper.appFishing.apiKey, {
        id: apiHelper.fisherEvartai.id,
        ...interceptedFields,
      });

      return resetUserData(apiHelper.fisherEvartai.id);
    });

    it('Logins unsuccessfully (bad app)', async () => {
      apiHelper.interceptFetch({ personalCode: apiHelper.fisherEvartai.personalCode });

      await request(apiService.server)
        .post(evartaiLoginEndpoint)
        .send({
          ticket: faker.lorem.word(),
        })
        .set(apiHelper.getHeaders(null, apiHelper.appHunting.apiKey))
        .expect(404);

      return resetUserData(apiHelper.fisherEvartai.id);
    });

    it('Logins successfully (self invite)', async () => {
      const interceptedFields = getUserData();

      apiHelper.interceptFetch({
        personalCode: apiHelper.fisherEvartai.personalCode,
        ...interceptedFields,
      });
      const res = await request(apiService.server)
        .post(evartaiLoginEndpoint)
        .send({
          ticket: faker.lorem.word(),
        })
        .set(apiHelper.getHeaders(null, apiHelper.appCreateOnLogin.apiKey))
        .expect(200);

      await validateUserFields(res, apiHelper.appCreateOnLogin.apiKey, {
        id: apiHelper.fisherEvartai.id,
        ...interceptedFields,
      });

      return resetUserData(apiHelper.fisherEvartai.id);
    });

    it('Logins successfully (same info two apps)', async () => {
      const interceptedFields = getUserData();

      apiHelper.interceptFetch({
        personalCode: apiHelper.fisherEvartai.personalCode,
        ...interceptedFields,
      });

      const res = await request(apiService.server)
        .post(evartaiLoginEndpoint)
        .send({
          ticket: faker.lorem.word(),
        })
        .set(apiHelper.getHeaders(null, apiHelper.appCreateOnLogin.apiKey))
        .expect(200);

      await validateUserFields(res, apiHelper.appCreateOnLogin.apiKey, {
        id: apiHelper.fisherEvartai.id,
        ...interceptedFields,
      });

      await validateUserFields(res, apiHelper.appFishing.apiKey, {
        id: apiHelper.fisherEvartai.id,
        ...interceptedFields,
      });

      return resetUserData(apiHelper.fisherEvartai.id);
    });

    it('Login fails (no personal code)', async () => {
      const interceptedFields = getUserData();

      apiHelper.interceptFetch({
        ...interceptedFields,
      });

      return request(apiService.server)
        .post(evartaiLoginEndpoint)
        .send({
          ticket: faker.lorem.word(),
        })
        .set(apiHelper.getHeaders(null, apiHelper.appCreateOnLogin.apiKey))
        .expect(400);

    });
  });
});
