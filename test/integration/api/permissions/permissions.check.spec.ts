'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig, testListCountsAndIds } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it, beforeEach } from '@jest/globals';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

const allAccesses = ['*'];
const noAccesses: Array<any> = [];
const defaultFeatures = ['*'];
const customPermissionAccesses = ['CUSTOM_ACCESS', 'CUSTOM_ACCESS_2'];
const customPermissionFeatures = ['CUSTOM_FEATURE', 'CUSTOM_FEATURE_2'];
const groupAdminPermissionAccesses = ['GROUP_ADMIN_ACCESS', 'GROUP_ADMIN_ACCESS_2'];
const groupAdminPermissionFeatures = ['GROUP_ADMIN_FEATURE', 'GROUP_ADMIN_FEATURE_2'];
const groupAdminInnerPermissionAccesses = [
  'GROUP_ADMIN_INNER_ACCESS',
  'GROUP_ADMIN_INNER_ACCESS_2',
];
const groupAdminInnerPermissionFeatures = [
  'GROUP_ADMIN_INNER_FEATURE',
  'GROUP_ADMIN_INNER_FEATURE_2',
];

const initialize = async (broker: any) => {
  await broker.start();
  await apiHelper.setup();
  await createPermission({
    app: apiHelper.appFishing.id,
    group: apiHelper.groupAdmin.id,
    features: groupAdminPermissionFeatures,
    accesses: groupAdminPermissionAccesses,
    municipalities: [1, 2, 3],
  });
  await createPermission({
    app: apiHelper.appFishing.id,
    group: apiHelper.groupAdminInner.id,
    features: groupAdminInnerPermissionFeatures,
    accesses: groupAdminInnerPermissionAccesses,
  });

  return true;
};

const createPermission = (data: any) => {
  return broker.call('permissions.create', data);
};

const removePermission = (id: any) => {
  return broker.call('permissions.remove', { id });
};

const checkPermissions = (user: any, app: any, features: Array<any>, accesses: Array<any>) => {
  const appType = app.type;
  expect(user.permissions).not.toBeUndefined();
  expect(Object.keys(user.permissions).length).toBeGreaterThan(0);
  const permissions = user.permissions[appType];
  expect(permissions).not.toBeUndefined();
  expect(permissions.features).toEqual(expect.arrayContaining(features));
  expect(permissions.accesses).toEqual(expect.arrayContaining(accesses));
  expect(permissions.features.length).toEqual(features.length);
  expect(permissions.accesses.length).toEqual(accesses.length);
};

describe('Test permissions for users', () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users/me';
  const endpointUsersByAccess = '/api/permissions/users';

  describe('Acting as super admin', () => {
    it('Check permissions in fishing app', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(res.body, apiHelper.appFishing, defaultFeatures, allAccesses);
        });
    });
  });

  describe('Acting as app', () => {
    it('Get users by access from fishing app', () => {
      return request(apiService.server)
        .get(endpointUsersByAccess)
        .set(apiHelper.getHeaders('', apiHelper.appFishing.apiKey))
        .send({
          access: groupAdminPermissionAccesses[1],
        })
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.admin.id, apiHelper.adminInner.id]);
        });
    });

    it('Get users by access (fail - no app)', () => {
      return request(apiService.server)
        .get(endpointUsersByAccess)
        .set(apiHelper.getHeaders('', false))
        .send({
          access: groupAdminPermissionAccesses[1],
        })
        .expect(401);
    });
  });

  describe('Acting as admin', () => {
    it('Check permissions', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(
            res.body,
            apiHelper.appFishing,
            groupAdminPermissionFeatures,
            groupAdminPermissionAccesses,
          );
        });
    });
  });

  describe('Acting as inner admin', () => {
    it('Check permissions', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(res.body, apiHelper.appFishing, groupAdminInnerPermissionFeatures, [
            ...groupAdminPermissionAccesses,
            ...groupAdminInnerPermissionAccesses,
          ]);
        });
    });

    it('Check permissions - assigned to user', async () => {
      const p: any = await createPermission({
        user: apiHelper.adminInner.id,
        app: apiHelper.appFishing.id,
        features: customPermissionFeatures,
        accesses: customPermissionAccesses,
      });

      await request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(res.body, apiHelper.appFishing, customPermissionFeatures, [
            ...customPermissionAccesses,
            ...groupAdminPermissionAccesses,
            ...groupAdminInnerPermissionAccesses,
          ]);
        });

      return removePermission(p.id);
    });

    it('Check permissions - assigned to user & admin inner group', async () => {
      const p: any = await createPermission({
        user: apiHelper.adminInner.id,
        group: apiHelper.groupAdminInner.id,
        app: apiHelper.appFishing.id,
        features: customPermissionFeatures,
        accesses: customPermissionAccesses,
      });
      await request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(res.body, apiHelper.appFishing, customPermissionFeatures, [
            ...customPermissionAccesses,
            ...groupAdminPermissionAccesses,
            ...groupAdminInnerPermissionAccesses,
          ]);
        });

      return removePermission(p.id);
    });

    it('Check permissions - assigned to admin inner group & role USER', async () => {
      const p: any = await createPermission({
        group: apiHelper.groupAdminInner.id,
        role: 'USER',
        app: apiHelper.appFishing.id,
        features: customPermissionFeatures,
        accesses: customPermissionAccesses,
      });
      await request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(res.body, apiHelper.appFishing, groupAdminInnerPermissionFeatures, [
            ...groupAdminPermissionAccesses,
            ...groupAdminInnerPermissionAccesses,
          ]);
        });

      return removePermission(p.id);
    });

    it('Check permissions - assigned to admin inner group & role ADMIN', async () => {
      const p: any = await createPermission({
        group: apiHelper.groupAdminInner.id,
        role: 'ADMIN',
        app: apiHelper.appFishing.id,
        features: customPermissionFeatures,
        accesses: customPermissionAccesses,
      });
      await request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(
            res.body,
            apiHelper.appFishing,
            [...groupAdminInnerPermissionFeatures, ...customPermissionFeatures],
            [
              ...customPermissionAccesses,
              ...groupAdminPermissionAccesses,
              ...groupAdminInnerPermissionAccesses,
            ],
          );
        });

      return removePermission(p.id);
    });

    it('Check permissions - assigned to admin group & role USER', async () => {
      const p: any = await createPermission({
        group: apiHelper.groupAdmin.id,
        role: 'USER',
        app: apiHelper.appFishing.id,
        features: customPermissionFeatures,
        accesses: customPermissionAccesses,
      });
      await request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(res.body, apiHelper.appFishing, groupAdminInnerPermissionFeatures, [
            ...customPermissionAccesses,
            ...groupAdminPermissionAccesses,
            ...groupAdminInnerPermissionAccesses,
          ]);
        });

      return removePermission(p.id);
    });
  });

  describe('Acting as fisher', () => {
    it('Check permissions', () => {
      return request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(res.body, apiHelper.appFishing, defaultFeatures, noAccesses);
        });
    });

    it('Check permissions - assigned to user type USER', async () => {
      const p: any = await createPermission({
        role: 'USER',
        app: apiHelper.appFishing.id,
        features: customPermissionFeatures,
        accesses: customPermissionAccesses,
      });
      await request(apiService.server)
        .get(endpoint)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          checkPermissions(
            res.body,
            apiHelper.appFishing,
            customPermissionFeatures,
            customPermissionAccesses,
          );
        });

      return removePermission(p.id);
    });

    it('Get users by access from fishing app', () => {
      return request(apiService.server)
        .get(endpointUsersByAccess)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send({
          access: groupAdminPermissionAccesses[1],
        })
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.admin.id, apiHelper.adminInner.id]);
        });
    });

    it('Get users by access with municipality from fishing app', () => {
      return request(apiService.server)
        .get(endpointUsersByAccess)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send({
          access: groupAdminPermissionAccesses[1],
          municipality: 2,
        })
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, [apiHelper.admin.id, apiHelper.adminInner.id]);
        });
    });

    it('Get users by access with bad municipality from fishing app', () => {
      return request(apiService.server)
        .get(endpointUsersByAccess)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send({
          access: groupAdminPermissionAccesses[1],
          municipality: 5,
        })
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, []);
        });
    });

    it('Get users by access with bad access from fishing app', () => {
      return request(apiService.server)
        .get(endpointUsersByAccess)
        .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
        .send({
          access: `${groupAdminPermissionAccesses[1]}-BAD`,
        })
        .expect(200)
        .expect((res: any) => {
          testListCountsAndIds(res, []);
        });
    });
  });
});
