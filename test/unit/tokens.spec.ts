'use strict';
import { describe, expect, it } from '@jest/globals';
import { isRefreshToken, isUntypedRefreshToken } from '../../utils/tokens';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TYPE,
} from '../../types/constants';

const iat = 1_700_000_000;

describe('isRefreshToken', () => {
  it('accepts only the explicit refresh type', () => {
    expect(isRefreshToken({ typ: REFRESH_TOKEN_TYPE })).toBe(true);
    expect(isRefreshToken({ typ: 'access' })).toBe(false);
  });

  it('does not treat an untyped long-lived token as a refresh token', () => {
    expect(isRefreshToken({ iat, exp: iat + REFRESH_TOKEN_TTL_SECONDS })).toBe(false);
  });
});

describe('isUntypedRefreshToken', () => {
  it('matches untyped tokens that outlive an access token', () => {
    expect(isUntypedRefreshToken({ iat, exp: iat + REFRESH_TOKEN_TTL_SECONDS })).toBe(true);
  });

  it('rejects an untyped access token', () => {
    expect(isUntypedRefreshToken({ iat, exp: iat + ACCESS_TOKEN_TTL_SECONDS })).toBe(false);
  });

  it('rejects typed tokens and tokens without timestamps', () => {
    expect(
      isUntypedRefreshToken({ typ: REFRESH_TOKEN_TYPE, iat, exp: iat + REFRESH_TOKEN_TTL_SECONDS }),
    ).toBe(false);
    expect(isUntypedRefreshToken({})).toBe(false);
  });
});
