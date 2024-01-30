'use strict';
import { ServiceBroker } from 'moleculer';
import { ApiHelper, errors, serviceBrokerConfig } from '../../../helpers/api';
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals';
import { User, UserType } from '../../../../services/users.service';
import { UserGroupRole } from '../../../../services/userGroups.service';

const request = require('supertest');

const broker = new ServiceBroker(serviceBrokerConfig);

const apiHelper = new ApiHelper(broker);
const apiService = apiHelper.initializeServices();

const initialize = async (broker: any) => {
  await broker.start();
  await apiHelper.setup();

  return true;
};

const createUser = (groupId?: any, appId?: any, type?: UserType): Promise<User> => {
  const createData: any = {
    firstName: 'Firstname',
    lastName: 'Lastname',
    type: type || UserType.ADMIN,
    email: `someemail${Math.floor(Math.random() * 1000)}@mail.com`,
  };

  if (groupId) {
    createData.groups = [
      {
        id: groupId,
        role: UserGroupRole.USER,
      },
    ];
  } else {
    createData.apps = [appId || apiHelper.appAdmin.id];
  }

  return broker.call('usersLocal.invite', createData, apiHelper.userLocalInviteMeta);
};

const removeUser = (id: any) => {
  return broker.call('users.removeUser', { id });
};

describe("Test DELETE '/api/users/:id'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users';

  describe('Acting as super admin', () => {
    it('Delete admin user in admin app (success)', async () => {
      const user = await createUser();

      return request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(user.id);
        });
    });

    it('Delete fisher user in admin app (unauthorized)', async () => {
      const user = await createUser(null, apiHelper.appFishing.id);

      await request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeUser(user.id);
    });

    it('Delete fisher user in fishing app (success)', async () => {
      const user = await createUser(null, apiHelper.appFishing.id);

      return request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(user.id);
        });
    });
  });

  describe('Acting as admin', () => {
    it('Delete any admin user in admin app (unauthorized)', async () => {
      const user = await createUser();

      await request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeUser(user.id);
    });

    it('Delete admin user (admin group) in admin app (success)', async () => {
      const user = await createUser(apiHelper.groupAdmin.id);

      return request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(user.id);
        });
    });

    it('Delete admin user (inner admin group) in admin app (success)', async () => {
      const user = await createUser(apiHelper.groupAdminInner.id);

      return request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(user.id);
        });
    });

    it('Delete fisher user in admin app (unauthorized)', async () => {
      const user = await createUser(null, apiHelper.appFishing.id);

      await request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeUser(user.id);
    });

    it('Delete fisher user in fishing app (success)', async () => {
      const user = await createUser(null, apiHelper.appFishing.id, UserType.USER);

      return request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(user.id);
        });
    });
  });

  describe('Acting as inner admin', () => {
    it('Delete any admin user in admin app (unauthorized)', async () => {
      const user = await createUser();

      await request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeUser(user.id);
    });

    it('Delete admin user (admin group) in admin app (unauthorized)', async () => {
      const user = await createUser(apiHelper.groupAdmin.id);

      await request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeUser(user.id);
    });

    it('Delete admin user (inner admin group) in admin app (success)', async () => {
      const user = await createUser(apiHelper.groupAdminInner.id);

      return request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(user.id);
        });
    });

    it('Delete fisher user in admin app (unauthorized)', async () => {
      const user = await createUser(null, apiHelper.appFishing.id);

      await request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken))
        .expect(401)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.UNAUTHORIZED);
        });

      return removeUser(user.id);
    });

    it('Delete fisher user in fishing app (success)', async () => {
      const user = await createUser(null, apiHelper.appFishing.id, UserType.USER);

      return request(apiService.server)
        .delete(`${endpoint}/${user.id}`)
        .set(apiHelper.getHeaders(apiHelper.adminInnerToken, apiHelper.appFishing.apiKey))
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toEqual(user.id);
        });
    });
  });
});
