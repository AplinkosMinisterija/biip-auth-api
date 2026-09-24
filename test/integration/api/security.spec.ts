'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, serviceBrokerConfig } from '../../helpers/api';
import { expect, describe, beforeAll, afterAll, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { UserType } from '../../../services/users.service';

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

  // P1-6 (revised): assigning a person into a company requires MEMBERSHIP of
  // that company, not group-ADMIN. Tenant apps map their manager roles (e.g.
  // zvejyba USER_ADMIN) to auth group-USER and authorize member management on
  // their side before calling; requiring group-ADMIN here 403'd every
  // USER_ADMIN invite in prod. The boundary that stays is cross-company:
  // a caller can never reach a company outside their membership tree.
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

    it('a non-admin member can assign a person to their own company (tenant-app managers)', () => {
      return request(apiService.server)
        .post('/api/users/invite')
        .set(apiHelper.getHeaders(apiHelper.fisherUserToken, apiHelper.appFishing.apiKey))
        .send({
          personalCode: '91234567892',
          companyId: apiHelper.groupFishersCompany.id,
          throwErrors: false,
        })
        .expect(200);
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

  // The /api route uses mappingPolicy 'restrict': only REST aliases resolve.
  // Raw DB CRUD and internal helper actions must not be reachable by name
  // (POST /api/<service>/<action>) — none of them carries a `types` gate.
  describe('raw actions are not reachable by name', () => {
    const byNameCalls: Array<[string, Record<string, unknown>]> = [
      ['/api/permissions/create', { accesses: ['*'], role: 'ADMIN' }],
      ['/api/users/create', { firstName: 'X', lastName: 'Y', email: 'bypass.create@am.lt' }],
      ['/api/users/assignGroups', { id: 1, groups: [{ id: 1, role: 'ADMIN' }] }],
      ['/api/users/find', {}],
      ['/api/users/getAuthUser', { id: 1, type: 'LOCAL', typeId: 1 }],
      ['/api/users/removeAllEntities', {}],
      ['/api/usersLocal/update', { id: 1, password: 'Bypass123!' }],
      ['/api/usersLocal/find', {}],
      ['/api/usersLocal/findOrCreate', { email: 'bypass.foc@am.lt', type: 'SUPER_ADMIN' }],
      ['/api/usersLocal/validateLogin', { email: 'bypass@am.lt', password: 'x' }],
      ['/api/usersLocal/removeUser', { id: 999999 }],
      ['/api/usersEvartai/find', {}],
      ['/api/usersEvartai/removeUser', { id: 999999 }],
      ['/api/userGroups/create', { user: 1, group: 1, role: 'ADMIN' }],
    ];

    it.each(byNameCalls)('POST %s is not routed', (path, body) => {
      return request(apiService.server)
        .post(path)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .send(body)
        .expect(404)
        .expect((res: any) => expect(res.body.name).toEqual('NotFoundError'));
    });

    it('a regular user cannot delete a group via DELETE /api/groups/:id', () => {
      return request(apiService.server)
        .delete('/api/groups/999999')
        .set(apiHelper.getHeaders(apiHelper.fisherUserToken, apiHelper.appFishing.apiKey))
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

  // Removing a company member must authorize by group MEMBERSHIP, not global
  // UserType and not group-ADMIN. External company managers are UserType.USER
  // (eVartai default) and tenant-app manager roles (e.g. zvejyba USER_ADMIN) map
  // to auth group-USER, so any stricter gate 403'd the tenant apps' removal
  // cascade — local row deleted, auth membership left dangling, ghost member
  // re-provisioned on next login. This mirrors the usersEvartai.invite authz:
  // the boundary auth enforces is cross-company, the role policy is the app's.
  describe('company member can unassign a member (invite parity)', () => {
    const unassign = (userId: number, groupId: number, token: string) =>
      request(apiService.server)
        .post(`/api/users/${userId}/groups/${groupId}/unassign`)
        .set(apiHelper.getHeaders(token, apiHelper.appFishing.apiKey));

    it('a group-ADMIN (UserType.USER) can unassign a member of their company', async () => {
      await unassign(
        apiHelper.fisherUser.id,
        apiHelper.groupFishersCompany.id,
        apiHelper.fisherToken,
      )
        .expect(200)
        .expect((res: any) => expect(res.body.success).toEqual(true));

      const membership = await broker.call('userGroups.findOne', {
        query: { user: apiHelper.fisherUser.id, group: apiHelper.groupFishersCompany.id },
      });
      expect(membership).toBeFalsy();

      // restore fixture state so ordering can't couple to this suite
      await broker.call('userGroups.create', {
        user: apiHelper.fisherUser.id,
        group: apiHelper.groupFishersCompany.id,
        role: 'USER',
      });
    });

    it('a non-admin member can unassign within their own company (tenant-app managers)', async () => {
      await unassign(
        apiHelper.fisher.id,
        apiHelper.groupFishersCompany.id,
        apiHelper.fisherUserToken,
      )
        .expect(200)
        .expect((res: any) => expect(res.body.success).toEqual(true));

      const membership = await broker.call('userGroups.findOne', {
        query: { user: apiHelper.fisher.id, group: apiHelper.groupFishersCompany.id },
      });
      expect(membership).toBeFalsy();

      // restore fixture state so ordering can't couple to this suite
      await broker.call('userGroups.create', {
        user: apiHelper.fisher.id,
        group: apiHelper.groupFishersCompany.id,
        role: 'ADMIN',
      });
    });

    it('a member cannot unassign from a same-app company they do not belong to', async () => {
      const otherCompany: any = await broker.call('groups.create', {
        name: 'Other Fishers Company (unassign)',
        apps: [apiHelper.appFishing.id],
        companyCode: '300000003',
      });

      return unassign(apiHelper.fisher.id, otherCompany.id, apiHelper.fisherUserToken).expect(
        (res: any) => {
          expect([401, 403]).toContain(res.status);
          expect(res.body.type).toEqual('AUTH_UNAUTHORIZED_GROUP');
        },
      );
    });

    it('a group-ADMIN cannot unassign from a company of another app', () => {
      return unassign(
        apiHelper.fisherUser.id,
        apiHelper.groupHuntersCompany.id,
        apiHelper.fisherToken,
      ).expect((res: any) => {
        expect([401, 403]).toContain(res.status);
        expect(res.body.type).toEqual('AUTH_UNAUTHORIZED_GROUP');
      });
    });
  });

  // `assign` has in-process login/invite callers (company auto-join,
  // defaultGroupId, assignNewGroupsToUser) whose subject is not yet a
  // group-admin, so it cannot move authorization into its body like `unassign`.
  // Instead it is typed APP: a trusted service holding a valid app key may call
  // it (the tenant apps' assignToGroup, acting user = UserType.USER); a browser,
  // which never holds an app key, still cannot. Internal broker calls bypass the
  // gateway and are unaffected.
  describe('userGroups.assign is service-callable with a valid app key (APP type)', () => {
    const assign = (userId: number, groupId: number, token: string, apiKey?: string | boolean) =>
      request(apiService.server)
        .post(`/api/users/${userId}/groups/${groupId}/assign`)
        .set(apiHelper.getHeaders(token, apiKey))
        .send({ role: 'USER' });

    it('a UserType.USER caller with a valid app key can assign (service-to-service)', () => {
      return assign(
        apiHelper.fisherUser.id,
        apiHelper.groupFishersCompany.id,
        apiHelper.fisherUserToken,
        apiHelper.appFishing.apiKey,
      ).expect(200);
    });

    it('the same caller without an app key (browser) is still refused', () => {
      return assign(
        apiHelper.fisherUser.id,
        apiHelper.groupFishersCompany.id,
        apiHelper.fisherUserToken,
        false,
      ).expect((res: any) => {
        expect([401, 403]).toContain(res.status);
      });
    });
  });
  // A tenant app key may only write memberships of its own app's groups;
  // administrators working through an admin-type app manage every app's groups.
  describe('userGroups.assign is confined to the calling app', () => {
    const assign = (groupId: number, token: string, apiKey?: string) =>
      request(apiService.server)
        .post(`/api/users/${apiHelper.fisherUser.id}/groups/${groupId}/assign`)
        .set(apiHelper.getHeaders(token, apiKey))
        .send({ role: 'ADMIN' });

    it('a tenant app key cannot assign into another app group', () => {
      return assign(
        apiHelper.groupHuntersCompany.id,
        apiHelper.fisherUserToken,
        apiHelper.appFishing.apiKey,
      )
        .expect(403)
        .expect((res: any) => expect(res.body.type).toEqual('AUTH_UNAUTHORIZED_GROUP'));
    });

    it('a tenant app key can assign into its own app group', () => {
      return assign(
        apiHelper.groupFishersCompany.id,
        apiHelper.fisherUserToken,
        apiHelper.appFishing.apiKey,
      ).expect(200);
    });

    it('an administrator in the admin app can assign into any app group', async () => {
      await assign(apiHelper.groupHuntersCompany.id, apiHelper.superAdminToken).expect(200);

      const membership: any = await broker.call('userGroups.findOne', {
        query: { user: apiHelper.fisherUser.id, group: apiHelper.groupHuntersCompany.id },
      });
      await broker.call('userGroups.remove', { id: membership.id });
    });

    it('a plain user in the admin app cannot assign into another app group', async () => {
      const email = 'admin.app.user@am.lt';
      await apiHelper.createUser(email, UserType.USER, [apiHelper.appAdmin.id]);
      const { token } = await apiHelper.loginUser(email, apiHelper.goodPassword);

      return assign(apiHelper.groupHuntersCompany.id, token)
        .expect(403)
        .expect((res: any) => expect(res.body.type).toEqual('AUTH_UNAUTHORIZED_GROUP'));
    });
  });

  describe('token lifecycle', () => {
    const me = (token: string, apiKey?: string) =>
      request(apiService.server).get('/api/users/me').set(apiHelper.getHeaders(token, apiKey));
    const refresh = (token: string, apiKey?: string) =>
      request(apiService.server)
        .post('/auth/refresh')
        .set(apiHelper.getHeaders(null, apiKey))
        .send({ token });

    let tokens: { token: string; refreshToken: string };
    beforeAll(async () => {
      tokens = await apiHelper.loginUser(apiHelper.goodEmail, apiHelper.goodPassword, true);
    });

    it('a refresh token is not accepted as a bearer token', () => {
      return me(tokens.refreshToken).expect(401);
    });

    it('an access token cannot be exchanged for new tokens', () => {
      return refresh(tokens.token)
        .expect(404)
        .expect((res: any) => expect(res.body.type).toEqual('NOT_FOUND'));
    });

    it('an untyped refresh token can still be exchanged', () => {
      const { iat, exp, ...claims } = jwt.decode(tokens.token) as Record<string, unknown>;
      const untypedRefreshToken = jwt.sign(claims, String(process.env.JWT_SECRET), {
        expiresIn: 60 * 60 * 24 * 30,
      });

      return refresh(untypedRefreshToken).expect(200);
    });

    it('a token whose role differs from the user it names is rejected', () => {
      // Shaped like a USERS-type app key whose app id collides with an admin's id.
      const appKeyLike = jwt.sign(
        { id: apiHelper.admin.id, type: 'USERS', name: 'Users', strategy: 'LOCAL' },
        String(process.env.JWT_SECRET),
        { expiresIn: 60 * 60 * 24 * 365 },
      );

      return request(apiService.server)
        .get('/api/permissions')
        .set(apiHelper.getHeaders(appKeyLike))
        .expect(401);
    });

    it('a demoted admin loses admin-only endpoints at once', async () => {
      const email = 'demoted.admin@am.lt';
      const admin = await apiHelper.createUser(email, UserType.ADMIN, [apiHelper.appAdmin.id]);
      const { token } = await apiHelper.loginUser(email, apiHelper.goodPassword);
      const listPermissions = () =>
        request(apiService.server).get('/api/permissions').set(apiHelper.getHeaders(token));

      await listPermissions().expect(200);
      await broker.call('users.update', { id: admin.id, type: UserType.USER });
      await new Promise((resolve) => setTimeout(resolve, 200));

      await listPermissions().expect(401);
    });

    it('a password change stops earlier sessions from being renewed', async () => {
      const email = 'revoked.session@am.lt';
      const user = await apiHelper.createUser(email, UserType.USER, [apiHelper.appFishing.id]);
      const old = await apiHelper.loginUser(
        email,
        apiHelper.goodPassword,
        true,
        apiHelper.appFishing,
      );
      // `iat` has one-second resolution; a token from the same second survives.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const userLocal: any = await broker.call('usersLocal.findOne', { query: { user: user.id } });
      const newPassword = 'N3wPassword!';
      await broker.call('usersLocal.update', { id: userLocal.id, password: newPassword });

      await refresh(old.refreshToken, apiHelper.appFishing.apiKey).expect(404);
      await me(old.token, apiHelper.appFishing.apiKey).expect(200);

      const fresh = await apiHelper.loginUser(email, newPassword, true, apiHelper.appFishing);
      await refresh(fresh.refreshToken, apiHelper.appFishing.apiKey).expect(200);
    });
  });
});
