import { PASSWORD_MAX_AGE_DAYS } from '../types/constants';

// True when a local password is older than the rotation window, or has never
// been stamped (NULL/invalid) — the latter is treated as expired so we fail
// closed. Pure and side-effect free so it can be unit-tested in isolation.
export const isPasswordExpired = (
  lastPasswordChangeAt: Date | string | null | undefined,
  maxAgeDays: number = PASSWORD_MAX_AGE_DAYS,
): boolean => {
  if (!lastPasswordChangeAt) return true;
  const changedAtMs = new Date(lastPasswordChangeAt).getTime();
  if (Number.isNaN(changedAtMs)) return true;
  const ageDays = (Date.now() - changedAtMs) / (1000 * 60 * 60 * 24);
  return ageDays >= maxAgeDays;
};
