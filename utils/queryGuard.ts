/*
 * Guards the parameters an HTTP caller sends through the gateway (the same rule as
 * biip-medziokle-api utils/queryGuard.ts).
 *
 * The @moleculer/database knex adapter hands a `$raw` key in a query to `whereRaw`, and a `sort`
 * entry starting with `&` to `orderByRaw`, so a caller who can send either runs arbitrary SQL.
 * Locally, `POST /api/users/find {"query":{"$raw":"..."}}` made an ordinary user SUPER_ADMIN.
 * `$raw` is refused in every parameter, not only `query`/`filter`: some actions build a query
 * from other params (`usersLocal.validateLogin` from `email`, `groups.findOrCreate` from the whole
 * request). String values are decoded as JSON again and again, because `list` decodes `query`
 * twice. Server-side code adds its own `$raw` conditions after the gateway; this does not touch
 * them.
 *
 * Every walk fails closed: a structure (or a chain of encodings) deeper than MAX_QUERY_DEPTH
 * counts as raw.
 */

export const MAX_QUERY_DEPTH = 32;

const RAW_KEY = '$raw';
const RAW_SORT_PREFIXES = ['&', '-&'];

const decodeJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch (_e) {
    return value;
  }
};

export function containsRaw(value: unknown, depth = 0): boolean {
  if (depth >= MAX_QUERY_DEPTH) return true;

  if (typeof value === 'string') {
    const decoded = decodeJson(value);
    return decoded !== value && typeof decoded !== 'number' && typeof decoded !== 'boolean'
      ? containsRaw(decoded, depth + 1)
      : false;
  }

  if (value === null || typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    return value.some((item) => containsRaw(item, depth + 1));
  }

  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) => key === RAW_KEY || containsRaw(item, depth + 1),
  );
}

const sortEntries = (sort: unknown): Array<unknown> => {
  if (Array.isArray(sort)) return sort;
  if (typeof sort === 'string') {
    const decoded = decodeJson(sort);
    return Array.isArray(decoded) ? decoded : sort.split(/[,\s]+/);
  }
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
  return containsRaw(params) || hasRawSort(params.sort);
}
