'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, serviceBrokerConfig } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals';
import { PermissionGrantErrorType } from '../../../../types';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

const endpoint = '/api/permissions';
const endpointModifyAccess = '/api/permissions/modifyAccessForGroup';
const endpointMunicipalities = '/api/permissions/municipalities';

const SOME_ACCESS = 'SOME_ACCESS';
const OTHER_ACCESS = 'OTHER_ACCESS';
const SOME_FEATURE = 'SOME_FEATURE';
const SOME_MUNICIPALITY = 13;
const STALE_ACCESS = 'STALE_ACCESS';
const USER_ROW_FEATURE = 'USER_ROW_FEATURE';

const initialize = async (broker: any) => {
  await broker.start();
  await apiHelper.setup();

  return true;
};

const expectForbidden = (type: PermissionGrantErrorType) => (res: any) => {
  expect(res.status).toEqual(403);
  expect(res.body.type).toEqual(type);
};

// Permission writes used to check only the caller's global type, so any ADMIN could give
// anyone, themselves included, any access in any app. These pin the narrower rule.
describe('Granting permissions', () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const grant = (token: string, body: Record<string, unknown>, apiKey?: string) =>
    request(apiService.server).post(endpoint).set(apiHelper.getHeaders(token, apiKey)).send(body);

  describe('POST /api/permissions', () => {
    it('a super admin can grant anything to any group', () => {
      return grant(apiHelper.superAdminToken, {
        group: apiHelper.groupFishers.id,
        app: apiHelper.appFishing.id,
        accesses: [SOME_ACCESS],
      }).expect(200);
    });

    it('an admin cannot give himself a user-level permission', () => {
      return grant(apiHelper.adminToken, {
        user: apiHelper.admin.id,
        app: apiHelper.appFishing.id,
        accesses: [SOME_ACCESS],
      }).expect(expectForbidden(PermissionGrantErrorType.USER_LEVEL));
    });

    it('an admin cannot change a group he does not administer', () => {
      return grant(apiHelper.adminToken, {
        group: apiHelper.groupFishers.id,
        app: apiHelper.appFishing.id,
        features: [SOME_FEATURE],
      }).expect(expectForbidden(PermissionGrantErrorType.GROUP));
    });

    it('an inner group admin cannot change its parent group', () => {
      return grant(apiHelper.adminInnerToken, {
        group: apiHelper.groupAdmin.id,
        app: apiHelper.appFishing.id,
        features: [SOME_FEATURE],
      }).expect(expectForbidden(PermissionGrantErrorType.GROUP));
    });

    it('an admin cannot grant an app he does not hold', () => {
      return grant(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appHunting.id,
        features: [SOME_FEATURE],
      }).expect(expectForbidden(PermissionGrantErrorType.APP));
    });

    it('an admin cannot grant an access he does not hold, even to his own group', () => {
      return grant(apiHelper.adminToken, {
        group: apiHelper.groupAdmin.id,
        app: apiHelper.appFishing.id,
        accesses: [SOME_ACCESS],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('an admin cannot grant the access wildcard', () => {
      return grant(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        accesses: ['*'],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('an admin can set features of a group he administers within his own', () => {
      return grant(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        features: [SOME_FEATURE],
      })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.group).toEqual(apiHelper.groupAdminInner.id);
          expect(res.body.features).toEqual([SOME_FEATURE]);
        });
    });

    it('an admin can pass on an access he holds to a group he administers', async () => {
      await grant(apiHelper.superAdminToken, {
        group: apiHelper.groupAdmin.id,
        app: apiHelper.appFishing.id,
        accesses: [SOME_ACCESS],
      }).expect(200);

      return grant(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        accesses: [SOME_ACCESS],
        features: [SOME_FEATURE],
      })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.accesses).toEqual([SOME_ACCESS]);
        });
    });

    it('an admin with restricted features cannot widen a group to all features', () => {
      // groupAdminInner now holds [SOME_FEATURE] only (set above); an empty list means all.
      return grant(apiHelper.adminInnerToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        features: [],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('an admin with restricted features cannot create a row without features', () => {
      return grant(apiHelper.adminInnerToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        role: 'USER',
        accesses: [],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('an admin with restricted features can change accesses only, keeping the features', () => {
      return grant(apiHelper.adminInnerToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        accesses: [SOME_ACCESS],
      })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.features).toEqual([SOME_FEATURE]);
        });
    });

    it('a stale cached permission does not let an admin grant what he no longer holds', async () => {
      await broker.cacher?.set(
        `permissions.getPermissionsByAppAndUser:${apiHelper.appFishing.id}:${apiHelper.admin.id}`,
        { accesses: [STALE_ACCESS], features: ['*'] },
      );

      return grant(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        accesses: [STALE_ACCESS],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it("a group grant never rewrites another user's row in the same group", async () => {
      // Fresh group: the user row exists before any group-only row, so a lookup that ignored
      // `user` would find and rewrite it.
      const userRow: any = await broker.call('permissions.create', {
        user: apiHelper.fisherUser.id,
        group: apiHelper.groupAdminInner2.id,
        app: apiHelper.appFishing.id,
        features: [USER_ROW_FEATURE],
      });

      await grant(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner2.id,
        app: apiHelper.appFishing.id,
        features: [SOME_FEATURE],
      })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toEqual(userRow.id);
          expect(res.body.user ?? null).toBeNull();
        });

      const unchanged: any = await broker.call('permissions.resolve', { id: userRow.id });
      expect(unchanged.features).toEqual([USER_ROW_FEATURE]);
    });

    it("a group grant without a role never rewrites a role's row", async () => {
      const freshGroup: any = await broker.call('groups.create', {
        name: 'Role row first',
        parent: apiHelper.groupAdmin.id,
      });
      const roleRow: any = await broker.call('permissions.create', {
        group: freshGroup.id,
        app: apiHelper.appFishing.id,
        role: 'USER',
        features: [USER_ROW_FEATURE],
      });

      await grant(apiHelper.adminToken, {
        group: freshGroup.id,
        app: apiHelper.appFishing.id,
        features: [SOME_FEATURE],
      })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.id).not.toEqual(roleRow.id);
        });

      const unchanged: any = await broker.call('permissions.resolve', { id: roleRow.id });
      expect(unchanged.features).toEqual([USER_ROW_FEATURE]);
    });
  });

  describe('POST /api/permissions/modifyAccessForGroup', () => {
    const modify = (token: string, body: Record<string, unknown>, apiKey?: string) =>
      request(apiService.server)
        .post(endpointModifyAccess)
        .set(apiHelper.getHeaders(token, apiKey))
        .send(body);

    it('through the admin app, an admin cannot change a group he does not administer', () => {
      return modify(apiHelper.adminToken, {
        group: apiHelper.groupFishers.id,
        app: apiHelper.appFishing.id,
        access: SOME_ACCESS,
        action: 'assign',
      }).expect(expectForbidden(PermissionGrantErrorType.GROUP));
    });

    it('through the admin app, an admin cannot assign an access he does not hold', () => {
      return modify(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        access: OTHER_ACCESS,
        action: 'assign',
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('through the admin app, an admin can unassign an access in a group he administers', () => {
      return modify(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        access: SOME_ACCESS,
        action: 'unassign',
      }).expect(200);
    });

    it('a module app key does not let an admin hand a company an access he lacks', () => {
      // He could join the company afterwards through user editing.
      return modify(
        apiHelper.adminToken,
        { group: apiHelper.groupFishersCompany.id, access: OTHER_ACCESS, action: 'assign' },
        apiHelper.appFishing.apiKey,
      ).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('a super admin still assigns a module access to a company', () => {
      return modify(
        apiHelper.superAdminToken,
        { group: apiHelper.groupFishersCompany.id, access: OTHER_ACCESS, action: 'assign' },
        apiHelper.appFishing.apiKey,
      )
        .expect(200)
        .expect((res: any) => {
          expect(res.body.app).toEqual(apiHelper.appFishing.id);
          expect(res.body.accesses).toContain(OTHER_ACCESS);
        });
    });

    it('a module app key does not let an admin give his own group every access', () => {
      return modify(
        apiHelper.adminToken,
        { group: apiHelper.groupAdmin.id, access: '*', action: 'assign' },
        apiHelper.appFishing.apiKey,
      ).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('a module app key does not let an admin give his own group an access he lacks', () => {
      return modify(
        apiHelper.adminToken,
        { group: apiHelper.groupAdmin.id, access: OTHER_ACCESS, action: 'assign' },
        apiHelper.appFishing.apiKey,
      ).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('a module app cannot give a company every access', () => {
      return modify(
        apiHelper.adminToken,
        { group: apiHelper.groupFishersCompany.id, access: '*', action: 'assign' },
        apiHelper.appFishing.apiKey,
      ).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('a module app key does not let an admin give a company he belongs to through a child group an access', async () => {
      const company: any = await broker.call('groups.create', {
        name: 'Fishing company with a child',
        apps: [apiHelper.appFishing.id],
        companyCode: apiHelper.companyCode,
      });
      const child: any = await broker.call('groups.create', {
        name: 'Fishing company child',
        parent: company.id,
      });
      await broker.call('userGroups.create', {
        user: apiHelper.admin.id,
        group: child.id,
        role: 'USER',
      });

      return modify(
        apiHelper.adminToken,
        { group: company.id, access: OTHER_ACCESS, action: 'assign' },
        apiHelper.appFishing.apiKey,
      ).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it("a module app cannot change another app's company", () => {
      return modify(
        apiHelper.adminToken,
        {
          group: apiHelper.groupHuntersCompany.id,
          access: OTHER_ACCESS,
          action: 'assign',
        },
        apiHelper.appFishing.apiKey,
      ).expect(expectForbidden(PermissionGrantErrorType.GROUP));
    });
  });

  describe('POST /api/permissions/municipalities', () => {
    const setMunicipalities = (token: string, body: Record<string, unknown>) =>
      request(apiService.server)
        .post(endpointMunicipalities)
        .set(apiHelper.getHeaders(token))
        .send(body);

    it('an admin cannot set municipalities of a group he does not administer', () => {
      return setMunicipalities(apiHelper.adminToken, {
        group: apiHelper.groupFishers.id,
        municipalities: [SOME_MUNICIPALITY],
      }).expect(expectForbidden(PermissionGrantErrorType.GROUP));
    });

    it("an admin cannot clear a group's municipalities to inherit its parent's", () => {
      return setMunicipalities(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        municipalities: [],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('a stale cached municipality management right does not let an admin clear municipalities', async () => {
      await broker.cacher?.set(
        `permissions.getPermissionsByAppAndUser:${apiHelper.appUsers.id}:${apiHelper.admin.id}`,
        { accesses: ['MANAGE_MUNICIPALITIES'], features: ['*'] },
      );

      return setMunicipalities(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        municipalities: [],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });

    it('an admin cannot grant municipalities outside his own', () => {
      return setMunicipalities(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        municipalities: [SOME_MUNICIPALITY],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });
  });
});
