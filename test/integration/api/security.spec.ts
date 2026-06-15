'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, serviceBrokerConfig } from '../../helpers/api';
import { expect, describe, beforeAll, afterAll, it, jest } from '@jest/globals';

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
      await broker.cacher?.del?.('auth.loginAttempts:user.fisher@am.lt');
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

    it('clears the failed-attempt counter on a successful login', async () => {
      const email = apiHelper.emailFisher;
      const key = `auth.loginAttempts:${email.toLowerCase()}`;
      const fail = () =>
        request(apiService.server)
          .post('/auth/login')
          .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
          .send({ email, password: 'WrongPassword1@' });

      for (let i = 0; i < 3; i++) await fail().expect(400);
      expect((await broker.cacher?.get(key))?.count).toBeGreaterThan(0);

      // A successful login must reset the counter so a legit user is never locked
      // out by their own earlier typos.
      await request(apiService.server)
        .post('/auth/login')
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send({ email, password: apiHelper.goodPassword })
        .expect(200);

      expect(await broker.cacher?.get(key)).toBeFalsy();
    });
  });

  // mappingPolicy:'all' on the /api route means an action with no REST alias is
  // still reachable by name (POST /api/<service>/<action>). rest:null does NOT
  // protect it — only a `types` gate does. These assert the raw mutating actions
  // reject a non-privileged caller via that direct-mapping path.
  describe('raw action surface is type-gated (mappingPolicy bypass)', () => {
    // Use adminToken (a real UserType.ADMIN) — these actions are SUPER_ADMIN-only,
    // so blocking an ADMIN proves the gate, not just the absence of privilege.
    it('an ADMIN cannot self-grant via POST /api/permissions/create', () => {
      return request(apiService.server)
        .post('/api/permissions/create')
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send({ group: apiHelper.groupFishersCompany.id, accesses: ['*'], role: 'ADMIN' })
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
        });
    });

    it('an ADMIN cannot create a user via POST /api/users/create', () => {
      return request(apiService.server)
        .post('/api/users/create')
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send({ firstName: 'X', lastName: 'Y', email: 'bypass.create@am.lt' })
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
        });
    });

    it('an ADMIN cannot grant group membership via POST /api/users/assignGroups', () => {
      return request(apiService.server)
        .post('/api/users/assignGroups')
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send({ id: 1, groups: [{ id: apiHelper.groupFishersCompany.id, role: 'ADMIN' }] })
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
        });
    });

    it('a regular user cannot delete a group via DELETE /api/groups/:id', () => {
      return request(apiService.server)
        .delete('/api/groups/999999')
        .set(apiHelper.getHeaders(apiHelper.fisherUserToken, apiHelper.appFishing.apiKey))
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
        });
    });

    // The user-deletion analog of the groups.removeGroup gate above. The real
    // HTTP delete is `users.removeUser` (validateIfAuthorized hook); these inner
    // sub-service actions are internal-only but reachable by name via the same
    // mappingPolicy:'all' direct-mapping, with no before-hook. Use adminToken (a
    // real ADMIN) — they are SUPER_ADMIN-gated, so blocking an ADMIN proves the
    // gate. A non-existent id keeps the assertion non-destructive: gate present →
    // 401/403; gate removed → the action would run and 404 (still fails here).
    it('an ADMIN cannot delete a user via POST /api/usersLocal/removeUser', () => {
      return request(apiService.server)
        .post('/api/usersLocal/removeUser')
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send({ id: 999999 })
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
        });
    });

    it('an ADMIN cannot revoke app access via POST /api/usersEvartai/removeUser', () => {
      return request(apiService.server)
        .post('/api/usersEvartai/removeUser')
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send({ id: 999999 })
        .expect((res: any) => {
          expect([401, 403]).toContain(res.status);
        });
    });
  });

  // eVartai `sign` must only accept a host whose ORIGIN is a registered app URL,
  // so an attacker host can't receive the auth ticket (account takeover).
  describe('evartai sign host validation', () => {
    // Restore after each test so the global.fetch stub from the accept case can
    // never leak into a later suite.
    afterEach(() => jest.restoreAllMocks());

    it('rejects a host that is not a registered app origin', () => {
      return request(apiService.server)
        .post('/auth/evartai/sign')
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send({ host: 'https://attacker.example.com' })
        .expect((res: any) => {
          expect(res.status).toEqual(400);
          expect(res.body.message).toEqual('Invalid host');
        });
    });

    it('accepts a registered app origin', () => {
      apiHelper.interceptFetch({ ticket: 'mock-ticket', url: 'https://evartai.example/auth' });
      const host = new URL(apiHelper.appFishing.url).origin;
      return request(apiService.server)
        .post('/auth/evartai/sign')
        .set(apiHelper.getHeaders(null, apiHelper.appFishing.apiKey))
        .send({ host })
        .expect(200);
    });
  });
});
