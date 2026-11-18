import { ServiceBroker } from 'moleculer';
import UsersEvartaiService from '../../services/usersEvartai.service';

jest.mock('../../mixins/database.mixin', () => () => ({}));

describe('eVartai ticket handling', () => {
  const broker = new ServiceBroker({ logger: false });
  const service = new UsersEvartaiService(broker);
  const ticket = '53ca8183-f794-4c91-afca-8b0c2e218915';
  const loginOptions = { meta: { app: { id: 1 } } };

  beforeAll(() => broker.start());
  afterAll(() => broker.stop());
  afterEach(() => jest.restoreAllMocks());

  it('maps helper HTTP 400 to an invalid ticket error', async () => {
    const body = JSON.stringify({ error: 'VIISP_TICKET_REJECTED', message: `Rejected ${ticket}` });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body, { status: 400 }));

    await expect(
      broker.call('usersEvartai.validateLogin', { ticket }, loginOptions),
    ).rejects.toMatchObject({
      code: 400,
      type: 'EVARTAI_TICKET_INVALID',
      message: 'eVartai ticket is invalid, expired or already used',
      data: undefined,
    });
  });

  it.each([
    { status: 502, body: JSON.stringify({ error: 'VIISP_UNAVAILABLE' }) },
    { status: 500, body: null },
  ])('maps helper HTTP $status to an unavailable error', async ({ status, body }) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body, { status }));

    await expect(
      broker.call('usersEvartai.validateLogin', { ticket }, loginOptions),
    ).rejects.toMatchObject({
      code: 502,
      type: 'EVARTAI_UNAVAILABLE',
      data: undefined,
    });
  });

  it('keeps the missing personal code error for a successful response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ firstName: 'Test' })));

    await expect(
      broker.call('usersEvartai.validateLogin', { ticket }, loginOptions),
    ).rejects.toMatchObject({
      code: 400,
      type: 'BAD_REQUEST',
      message: 'Personal code is not defined',
      data: undefined,
    });
  });

  it('returns the user from a successful helper response', async () => {
    const userData = {
      firstName: 'Test',
      personalCode: '00000000000',
      phoneNumber: '+10000000000',
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(userData)));

    await expect(service.getUserByTicket(ticket)).resolves.toMatchObject({
      firstName: userData.firstName,
      personalCode: userData.personalCode,
      phone: userData.phoneNumber,
      originalData: userData,
    });
  });

  it('keeps the network failure error without forwarding the ticket URL', async () => {
    const url = `https://helper.example/auth/data?ticket=${ticket}`;
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error(`Cannot reach ${url}`));

    await expect(service.getUserByTicket(ticket)).rejects.toMatchObject({
      code: 400,
      type: 'BAD_REQUEST',
      message: 'Cannot parse ticket',
      data: undefined,
    });
  });
});
