/*
 * Guards the query parameters an HTTP caller sends through the gateway (the same rule as
 * biip-medziokle-api utils/queryGuard.ts).
 *
 * The @moleculer/database knex adapter hands a `$raw` key in `query` or `filter` straight to
 * `whereRaw`, and a `sort` entry starting with `&` to `orderByRaw`, so a caller who can send
 * either runs arbitrary SQL: locally, `POST /api/users/find {"query":{"$raw":"true; UPDATE
 * users ..."}}` made an ordinary user SUPER_ADMIN. Server-side code adds its own `$raw`
 * conditions after the gateway, which this does not touch.
 *
 * Every walk fails closed: a structure deeper than MAX_QUERY_DEPTH counts as raw.
 */

export const MAX_QUERY_DEPTH = 32;

const RAW_KEY = '$raw';
const RAW_SORT_PREFIXES = ['&', '-&'];

export function containsRaw(value: unknown, depth = 0): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (depth >= MAX_QUERY_DEPTH) return true;

  if (Array.isArray(value)) {
    return value.some((item) => containsRaw(item, depth + 1));
  }

  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) => key === RAW_KEY || containsRaw(item, depth + 1),
  );
}

export function parseJsonParam(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (_e) {
    // Not JSON: the database mixin rejects it on its own.
    return value;
  }
}

const sortEntries = (sort: unknown): Array<unknown> => {
  if (Array.isArray(sort)) return sort;
  if (typeof sort === 'string') return sort.split(/[,\s]+/);
  return [];
};

export function hasRawSort(sort: unknown): boolean {
  return sortEntries(sort).some(
    (entry) =>
      typeof entry === 'string' &&
      RAW_SORT_PREFIXES.some((prefix) => entry.trim().startsWith(prefix)),
  );
}

export function hasRawQueryParams(params: Record<string, unknown> = {}): boolean {
  return (
    containsRaw(parseJsonParam(params.query)) ||
    containsRaw(parseJsonParam(params.filter)) ||
    hasRawSort(parseJsonParam(params.sort))
  );
}
