'use strict';
import { describe, expect, it, jest } from '@jest/globals';

const captureException = jest.fn();
jest.mock('@sentry/node', () => ({ captureException }));

import { trySendEmail } from '../../utils/mails';

describe('trySendEmail', () => {
  it('awaits a successful send and reports nothing', async () => {
    const send = jest.fn<() => Promise<string>>().mockResolvedValue('sent');

    await expect(trySendEmail(send)).resolves.toBe(true);

    expect(send).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not propagate a transport failure, and reports it to Sentry', async () => {
    captureException.mockClear();
    const error = new Error('getaddrinfo EAI_AGAIN api.postmarkapp.com');
    const send = jest.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(trySendEmail(send)).resolves.toBe(false);

    expect(captureException).toHaveBeenCalledWith(error, { extra: {} });
  });

  it('tags the report so one mail type does not hide behind another', async () => {
    captureException.mockClear();
    const error = new Error('Postmark is down');
    const send = jest.fn<() => Promise<never>>().mockRejectedValue(error);

    await trySendEmail(send, { template: 'user-invitation' });

    expect(captureException).toHaveBeenCalledWith(error, {
      extra: { template: 'user-invitation' },
    });
  });
});
