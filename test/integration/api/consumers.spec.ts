'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, serviceBrokerConfig } from '../../helpers/api';
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

// Every path the shared client (biip-auth-nodejs, used by all tenant APIs and
// admin-api) calls must resolve to an action. Auth or validation errors are fine
// here; only "no such route/action" breaks a consumer. Ids that do not exist keep
// destructive calls harmless. Not listed: the client's PATCH/DELETE
// /api/permissions/:id and POST/PATCH/DELETE /api/apps(/:id), which have no
// action behind them.
const routeMissErrors = ['NotFoundError', 'ServiceNotFoundError'];
const consumerPaths: Array<[string, string]> = [
  ['get', '/api/users'],
  ['get', '/api/users/999999'],
  ['post', '/api/users'],
  ['patch', '/api/users/999999'],
  ['delete', '/api/users/999999'],
  ['get', '/api/users/me'],
  ['post', '/api/users/logout'],
  ['post', '/api/users/invite'],
  ['post', '/api/users/999999/impersonate'],
  ['post', '/api/users/999999/groups/999999/assign'],
  ['post', '/api/users/999999/groups/999999/unassign'],
  ['get', '/api/groups'],
  ['get', '/api/groups/999999'],
  ['post', '/api/groups'],
  ['patch', '/api/groups/999999'],
  ['delete', '/api/groups/999999'],
  ['get', '/api/permissions'],
  ['get', '/api/permissions/999999'],
  ['post', '/api/permissions'],
  ['get', '/api/permissions/users'],
  ['get', '/api/permissions/municipalities'],
  ['post', '/api/permissions/municipalities'],
  ['get', '/api/permissions/municipalities/999999/users'],
  ['post', '/api/permissions/modifyAccessForGroup'],
  ['get', '/api/apps'],
  ['get', '/api/apps/999999'],
  ['get', '/api/apps/users'],
  ['post', '/api/apps/999999/generate'],
  ['get', '/public/groups/999999/users'],
  ['get', '/auth/apps/me'],
  ['get', '/auth/seedData'],
  ['post', '/auth/login'],
  ['post', '/auth/refresh'],
  ['post', '/auth/remind'],
  ['post', '/auth/change/verify'],
  ['post', '/auth/change/accept'],
  ['post', '/auth/evartai/sign'],
  ['post', '/auth/evartai/login'],
];

describe('Consumer contract: client library paths stay routed', () => {
  beforeAll(async () => {
    await broker.start();
    await apiHelper.setup();
  });
  afterAll(() => broker.stop());

  it.each(consumerPaths)('%s %s', (method, path) => {
    return request(apiService.server)
      [method](path)
      .set(apiHelper.getHeaders(apiHelper.superAdminToken))
      .send({})
      .expect((res: any) => expect(routeMissErrors).not.toContain(res.body?.name));
  });
});
