'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, serviceBrokerConfig } from '../../helpers/api';
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

// Regression tests for the security hardening on this branch. Each block maps to
// a specific finding so a future change that re-opens the hole fails loudly.
describe('Security hardening', () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  // P0-1: the raw permissions CRUD surface must not be reachable by ordinary
  // users (privilege escalation / enumeration).
  describe('permissions CRUD is locked down', () => {
    it('regular user cannot PATCH a permission', () => {
      return request(apiService.server)
        .patch('/api/permissions/1')
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send({ accesses: ['*'], role: 'ADMIN' })
        .expect((res: any) => {
          expect([401, 403, 404]).toContain(res.status);
        });
    });

    it('regular user cannot DELETE a permission', () => {
      return request(apiService.server)
        .delete('/api/permissions/1')
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect((res: any) => {
          expect([401, 403, 404]).toContain(res.status);
        });
    });

    it('regular user cannot list permissions', () => {
      return request(apiService.server)
        .get('/api/permissions')
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
        });
    });

    it('regular user cannot get a permission by id', () => {
      return request(apiService.server)
        .get('/api/permissions/1')
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect((res: any) => {
          expect([401, 403, 404]).toContain(res.status);
        });
    });
  });

  // P1-9: full cache flush is a DoS lever. The gateway's own action is not
  // auto-aliased under /api in this config (so it currently 404s), but the
  // action is also SUPER_ADMIN-typed now — assert a regular user can never get a
  // success response (guards against it being re-exposed as PUBLIC).
  describe('cache clean is not callable by a regular user', () => {
    it('regular user does not get a success response', () => {
      return request(apiService.server)
        .post('/api/cache/clean')
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect((res: any) => {
          expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });
  });

  // P1-6: assigning a person into a company requires admin rights on that
  // company. A group member who is not its admin must be refused.
  describe('cross-company invite guard', () => {
    it('company admin can assign a person to their company', () => {
      return request(apiService.server)
        .post('/api/users/invite')
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send({
          personalCode: '91234567895',
          companyId: apiHelper.groupFishersCompany.id,
          throwErrors: false,
        })
        .expect(200);
    });

    it('non-admin group member cannot assign a person to the company', () => {
      return request(apiService.server)
        .post('/api/users/invite')
        .set(apiHelper.getHeaders(apiHelper.fisherUserToken, apiHelper.appFishing.apiKey))
        .send({
          personalCode: '91234567892',
          companyId: apiHelper.groupFishersCompany.id,
          throwErrors: false,
        })
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
          expect(res.body.type).toEqual('AUTH_UNAUTHORIZED_COMPANY');
        });
    });

    it('company admin cannot assign into a company of another app', () => {
      return request(apiService.server)
        .post('/api/users/invite')
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send({
          personalCode: '91234567893',
          companyId: apiHelper.groupHuntersCompany.id,
          throwErrors: false,
        })
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
          expect(res.body.type).toEqual('AUTH_UNAUTHORIZED_COMPANY');
        });
    });
  });

  // P1-11: password login is throttled after repeated failures.
  describe('login brute-force throttle', () => {
    beforeAll(() => {
      process.env.ENABLE_LOGIN_RATE_LIMIT = 'true';
    });
    afterAll(async () => {
      delete process.env.ENABLE_LOGIN_RATE_LIMIT;
      await broker.cacher?.del?.('auth.loginAttempts:bruteforce.target@am.lt');
    });

    it('blocks after too many failed attempts', async () => {
      const email = 'bruteforce.target@am.lt';
      const attempt = () =>
        request(apiService.server)
          .post('/auth/login')
          .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
          .send({ email, password: 'WrongPassword1@' });

      for (let i = 0; i < 10; i++) {
        await attempt().expect(400);
      }

      return attempt().expect((res: any) => {
        expect(res.status).toEqual(429);
        expect(res.body.type).toEqual('TOO_MANY_ATTEMPTS');
      });
    });
  });
});
