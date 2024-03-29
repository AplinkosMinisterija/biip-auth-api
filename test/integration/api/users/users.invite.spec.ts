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

describe("Test POST '/api/users/invite'", () => {
  beforeAll(() => initialize(broker));
  afterAll(() => broker.stop());

  const endpoint = '/api/users/invite';

  describe('Acting as super admin', () => {
    it('Invite company (success)', () => {
      const companyCode = '265604616';
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send({
          companyCode,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.companyCode).toEqual(companyCode);
        });
    });

    it('Invite user (success)', () => {
      const personalCode = '91234567895';
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send({
          personalCode,
        })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.personalCode).toEqual(personalCode);
        });
    });

    it('Invite user with invalid personal code (fail)', () => {
      const personalCode = '1234567890abc';
      return request(apiService.server)
        .post(endpoint)
        .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
        .send({
          personalCode,
        })
        .expect(422)
        .expect((res: any) => {
          expect(res.body.type).toEqual(errors.AUTH_INVALID_PERSONAL_CODE);
        });
    });

    describe('Invite company with parent company', () => {
      it('With fishing group parent (success)', () => {
        const companyCode = '446963851';
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
          .send({
            companyCode,
            companyId: apiHelper.groupFishersCompany.id,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.companyCode).toEqual(companyCode);
            expect(res.body.parent).toEqual(apiHelper.groupFishersCompany.id);
          });
      });

      it('With hunting parent (fail)', () => {
        const companyCode = '854103766';
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
          .send({
            companyCode,
            companyId: apiHelper.groupHunters.id,
          })
          .expect(404)
          .expect((res: any) => {
            expect(res.body.type).toEqual(errors.NOT_FOUND);
          });
      });
    });

    describe('Invite same company', () => {
      it('Invite fishers company to fishing app (fail)', () => {
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
          .send({
            companyCode: apiHelper.groupFishersCompany.companyCode,
          })
          .expect(422)
          .expect((res: any) => {
            expect(res.body.type).toEqual(errors.AUTH_COMPANY_EXISTS);
          });
      });

      it('Invite fishers company to hunting app (success)', () => {
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
          .send({
            companyCode: apiHelper.groupFishersCompany.companyCode,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.companyCode).toEqual(apiHelper.groupFishersCompany.companyCode);
          });
      });
    });

    describe('Invite same user to company', () => {
      it('Invite fisher to fisher company (success)', () => {
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
          .send({
            personalCode: apiHelper.fisherEvartai.personalCode,
            companyId: apiHelper.groupFishersCompany.id,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.id).toEqual(apiHelper.fisherEvartai.id);
          });
      });

      it('Invite fisher to fisher company 2nd time (fail)', () => {
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
          .send({
            personalCode: apiHelper.fisherEvartai.personalCode,
            companyId: apiHelper.groupFishersCompany.id,
          })
          .expect(422)
          .expect((res: any) => {
            expect(res.body.type).toEqual(errors.AUTH_USER_ASSIGNED);
          });
      });

      it('Invite fisher to fisher company 3rd time with role (success)', () => {
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
          .send({
            personalCode: apiHelper.fisherEvartai.personalCode,
            companyId: apiHelper.groupFishersCompany.id,
            role: 'ADMIN',
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.id).toEqual(apiHelper.fisherEvartai.id);
          });
      });

      it('Invite fisher to hunting app (success)', () => {
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
          .send({
            personalCode: apiHelper.fisherEvartai.personalCode,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.id).toEqual(apiHelper.fisherEvartai.id);
          });
      });

      it('Invite fisher to hunting company (success)', () => {
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
          .send({
            personalCode: apiHelper.fisherEvartai.personalCode,
            companyId: apiHelper.groupHuntersCompany.id,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.id).toEqual(apiHelper.fisherEvartai.id);
          });
      });
    });

    describe('Invite user to company first', () => {
      it('Invite user to company first and then as user to same app (fail)', async () => {
        const { body: user } = await request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
          .send({
            personalCode: '91234567892',
            companyId: apiHelper.groupHuntersCompany.id,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.id).not.toBeUndefined();
          });

        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
          .send({
            personalCode: user.personalCode,
          })
          .expect(422)
          .expect((res: any) => {
            expect(res.body.type).toEqual(errors.AUTH_USER_EXISTS);
          });
      });

      it('Invite user to company first and then as user to different apps (success)', async () => {
        const { body: user } = await request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appHunting.apiKey))
          .send({
            personalCode: '91234567893',
            companyId: apiHelper.groupHuntersCompany.id,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.id).not.toBeUndefined();
          });

        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.superAdminToken, apiHelper.appFishing.apiKey))
          .send({
            personalCode: user.personalCode,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.id).toEqual(user.id);
          });
      });
    });
  });

  describe('Acting as fisher', () => {
    describe('Invite company with parent company', () => {
      it('With fishing group parent (success)', async () => {
        const companyCode = '196541141';
        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
          .send({
            companyCode,
            companyId: apiHelper.groupFishersCompany.id,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.companyCode).toEqual(companyCode);
            expect(res.body.parent).toEqual(apiHelper.groupFishersCompany.id);
          });
      });

      it('With fishing group parent (multilevel) (success)', async () => {
        const companyCode = '458295438';
        const companyCode2 = '339106451';
        const res = await request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
          .send({
            companyCode,
            companyId: apiHelper.groupFishersCompany.id,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.companyCode).toEqual(companyCode);
            expect(res.body.parent).toEqual(apiHelper.groupFishersCompany.id);
          });

        const innerCompanyId = res.body.id;

        return request(apiService.server)
          .post(endpoint)
          .set(apiHelper.getHeaders(apiHelper.fisherToken, apiHelper.appFishing.apiKey))
          .send({
            companyCode: companyCode2,
            companyId: innerCompanyId,
          })
          .expect(200)
          .expect((res: any) => {
            expect(res.body.companyCode).toEqual(companyCode2);
            expect(res.body.parent).toEqual(innerCompanyId);
          });
      });
    });
  });
});
