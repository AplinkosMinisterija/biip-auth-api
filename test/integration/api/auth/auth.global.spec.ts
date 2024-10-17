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

const validationErrorValidateFields = (res: any, fieldsToCheck: Array<string>) => {
  const fields = res.body.data.map((d: any) => d.field);

  expect(res.body.type).toEqual(errors.VALIDATION_ERROR);
  expect(fields.length).toEqual(fieldsToCheck.length);
  expect(fields).toEqual(expect.arrayContaining(fieldsToCheck));
};

describe("Test '/auth' endpoints", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  describe("Test '/auth/login' endpoint", () => {
    const authLoginEndpoint = '/auth/login';

    it('Validate required login fields', () => {
      return request(apiService.server)
        .post(authLoginEndpoint)
        .set(apiHelper.getHeaders())
        .expect(422)
        .expect((res: any) => {
          validationErrorValidateFields(res, ['password', 'email']);
        });
    });

    it('With wrong email', () => {
      return request(apiService.server)
        .post(authLoginEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          email: apiHelper.badEmail,
          password: apiHelper.goodPassword,
        })
        .expect(400)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.WRONG_PASSWORD);
        });
    });

    it('With wrong password', () => {
      return request(apiService.server)
        .post(authLoginEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          email: apiHelper.goodEmail,
          password: apiHelper.badPassword,
        })
        .expect(400)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.WRONG_PASSWORD);
        });
    });

    it('With good email & password (no refresh token)', () => {
      return request(apiService.server)
        .post(authLoginEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          email: apiHelper.goodEmail,
          password: apiHelper.goodPassword,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.token).not.toBeUndefined();
          expect(res.body.refreshToken).toBeUndefined();
        });
    });

    it('With good email & password (with refresh token)', () => {
      return request(apiService.server)
        .post(authLoginEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          email: apiHelper.goodEmail,
          password: apiHelper.goodPassword,
          refresh: true,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.token).not.toBeUndefined();
          expect(res.body.refreshToken).not.toBeUndefined();
        });
    });
  });

  describe("Test '/auth/remind' endpoint", () => {
    const authRemindEndpoint = '/auth/remind';

    it('With bad email', () => {
      return request(apiService.server)
        .post(authRemindEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          email: apiHelper.badEmail,
        })
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('With good email', () => {
      return request(apiService.server)
        .post(authRemindEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          email: apiHelper.goodEmail,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.success).toBeTruthy();
        });
    });

    it('With good email (2nd attempt) - timer is on', () => {
      return request(apiService.server)
        .post(authRemindEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          email: apiHelper.goodEmail,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.success).toBeFalsy();
        });
    });
  });

  describe('Test verifying password change', () => {
    let hashes: any = {};
    const verifyEndpoint = '/auth/change/verify';
    const changeEndpoint = '/auth/change/accept';
    beforeAll(async () => {
      const { url }: any = await broker.call(
        'auth.remindPassword',
        {
          email: apiHelper.fisher.email,
        },
        { meta: { app: apiHelper.appFishing } },
      );

      const urlData = new URL(url);

      hashes = {
        h: urlData.searchParams.get('h'),
        s: urlData.searchParams.get('s'),
      };

      return true;
    });

    it('Verify url params (success)', () => {
      return request(apiService.server)
        .post(verifyEndpoint)
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send(hashes)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.user?.email).toEqual(apiHelper.fisher.email);
        });
    });

    it('Change password (success)', () => {
      return request(apiService.server)
        .post(changeEndpoint)
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send({
          ...hashes,
          password: apiHelper.goodPassword,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.success).toBeTruthy();
        });
    });

    it('Verify url params 2nd time after password changed (fail)', () => {
      return request(apiService.server)
        .post(verifyEndpoint)
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send(hashes)
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });

    it('Change password 2nd time with same hashes (fail)', () => {
      return request(apiService.server)
        .post(changeEndpoint)
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send({
          ...hashes,
          password: apiHelper.goodPassword,
        })
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });
  });

  describe("Test '/auth/refresh' endpoint", () => {
    const authRefreshEndpoint = '/auth/refresh';
    let tokens: any;

    beforeAll(async () => {
      tokens = await apiHelper.loginUser(apiHelper.goodEmail, apiHelper.goodPassword, true);
      // loggedInHeaders = apiHelper.getHeaders(token)
    });

    it('Without token', () => {
      return request(apiService.server)
        .post(authRefreshEndpoint)
        .set(apiHelper.getHeaders())
        .expect(422)
        .expect((res: any) => {
          validationErrorValidateFields(res, ['token']);
        });
    });

    it('With token', () => {
      return request(apiService.server)
        .post(authRefreshEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          token: tokens.refreshToken,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.token).not.toBeUndefined();
          expect(res.body.refreshToken).not.toBeUndefined();
        });
    });

    it('With bad token', () => {
      return request(apiService.server)
        .post(authRefreshEndpoint)
        .set(apiHelper.getHeaders())
        .send({
          token: tokens.refreshToken + '-',
        })
        .expect(404)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.NOT_FOUND);
        });
    });
  });

  describe("Test '/auth/apps/me' endpoint", () => {
    const authAppEndpoint = '/auth/apps/me';

    it("Gets app info by 'x-api-key' header", () => {
      return request(apiService.server)
        .get(authAppEndpoint)
        .set(apiHelper.getHeaders())
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).toEqual(apiHelper.appAdmin.id);
        });
    });
  });
});
