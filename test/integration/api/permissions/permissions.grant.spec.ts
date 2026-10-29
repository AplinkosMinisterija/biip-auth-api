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
      // groupAdminInner now holds [SOME_FEATURE] only (set above).
      return grant(apiHelper.adminInnerToken, {
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
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

    it('a module app can assign its own access to one of its companies (tenant flow)', () => {
      return modify(
        apiHelper.adminToken,
        {
          group: apiHelper.groupFishersCompany.id,
          access: OTHER_ACCESS,
          action: 'assign',
        },
        apiHelper.appFishing.apiKey,
      )
        .expect(200)
        .expect((res: any) => {
          expect(res.body.app).toEqual(apiHelper.appFishing.id);
          expect(res.body.accesses).toContain(OTHER_ACCESS);
        });
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

    it('an admin cannot grant municipalities outside his own', () => {
      return setMunicipalities(apiHelper.adminToken, {
        group: apiHelper.groupAdminInner.id,
        municipalities: [SOME_MUNICIPALITY],
      }).expect(expectForbidden(PermissionGrantErrorType.EXCEEDS_OWN));
    });
  });
});
