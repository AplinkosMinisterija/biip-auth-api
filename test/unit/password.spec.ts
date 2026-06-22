'use strict';
import { describe, expect, it } from '@jest/globals';
import { isPasswordExpired } from '../../utils/password';
import { PASSWORD_MAX_AGE_DAYS } from '../../types/constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

describe('isPasswordExpired', () => {
  it('treats a missing timestamp as expired (fail closed)', () => {
    expect(isPasswordExpired(null)).toBe(true);
    expect(isPasswordExpired(undefined)).toBe(true);
  });

  it('treats an unparseable timestamp as expired (fail closed)', () => {
    expect(isPasswordExpired('not-a-date')).toBe(true);
  });

  it('is not expired for a freshly set password', () => {
    expect(isPasswordExpired(new Date())).toBe(false);
  });

  it(`is not expired just under ${PASSWORD_MAX_AGE_DAYS} days`, () => {
    expect(isPasswordExpired(daysAgo(PASSWORD_MAX_AGE_DAYS - 1))).toBe(false);
  });

  it(`is expired at and beyond ${PASSWORD_MAX_AGE_DAYS} days`, () => {
    expect(isPasswordExpired(daysAgo(PASSWORD_MAX_AGE_DAYS + 1))).toBe(true);
  });

  it('accepts ISO date strings', () => {
    expect(isPasswordExpired(daysAgo(200).toISOString())).toBe(true);
    expect(isPasswordExpired(daysAgo(1).toISOString())).toBe(false);
  });

  it('honours a custom max age', () => {
    expect(isPasswordExpired(daysAgo(10), 30)).toBe(false);
    expect(isPasswordExpired(daysAgo(40), 30)).toBe(true);
  });
});
