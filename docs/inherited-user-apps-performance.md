# `inherited_user_apps` performance — root cause and fix options

**Status: DESIGN / DRAFT. Do NOT apply any of the SQL below to production
without completing the checklist at the end.** This file intentionally ships
*no runnable migration*: a materialized view applied without its refresh
mechanism would freeze every user's app permissions forever, which is worse
than the current slowness. The migration and the refresh wiring must land
together.

## Symptom

Production Sentry (medziokle-api and auth-api) shows recurring bursts of
`RequestTimeoutError` on the auth path — `auth.parseToken`,
`permissions.validatePermissionToAccessApp`, `inheritedUserApps.find`,
`users.me`, `users.getAuthUser` — plus `Knex: Timeout acquiring a connection.
The pool is probably full`. Episodes on 2026-04-30, 2026-05-12, and ongoing
since 2026-05-27. End-user effect (reported by hunters): after the app has been
idle for a long time, the first launch hangs on the loader and never connects;
killing and reopening the app fixes it.

## Root cause

The auth/token-resolution hot path is:

```
api.service.ts authenticate
  -> auth.parseToken (auth.service.ts:275)           # JWT verify, no DB
  -> permissions.validatePermissionToAccessApp        # cached 1h (permissions.service.ts)
  -> inheritedUserApps.getAppsByUser                  # inheritedUserApps.service.ts:66
  -> inheritedUserApps.find { query: { user: id } }   # SELECT ... FROM inherited_user_apps WHERE user_id = ?
```

`inherited_user_apps` is a **plain (non-materialized) VIEW**
(`database/migrations/202311130104720_updateInheritedAppsViews.js`). Its
definition aggregates **all users**:

```sql
SELECT user_id, jsonb_agg(inherited_apps_ids) AS inherited_apps_ids, user_type
FROM ( SELECT DISTINCT user_id, user_type, jsonb_array_elements(inherited_apps_ids) ...
       FROM ( SELECT u.id AS user_id, ...
              FROM users u
              LEFT JOIN user_groups ug ON ug.user_id = u.id
              LEFT JOIN inherited_group_apps iga ON iga.group_id = ug.group_id
              WHERE u.deleted_at IS NULL ) ... )
GROUP BY user_id, user_type
```

`inherited_group_apps` is itself a **recursive CTE over the entire `groups`
tree**.

Because the outer `GROUP BY user_id` sits above the scan, Postgres **cannot push
`WHERE user_id = ?` into the inner query**. Every cache miss therefore
recomputes the whole view — the full recursive group tree plus every user — just
to return one user's row.

### Why "idle → hang → restart fixes it"

`validatePermissionToAccessApp` caches results in Redis for 1h
(`permissions.service.ts`). After a long idle the cache entries expire. The next
launch fires a burst of requests that all miss the cache at once → each one
triggers a full-view recompute → the connection pool (`knexfile.ts:16`,
`max: 30`, comment already says *"bumped 10→30 … Recalibrate after we
materialize"*) saturates → further `acquire` calls wait out the ~60s tarn
timeout → medziokle-api's 10s Moleculer timeout fires first and surfaces as
`resolveToken` timeouts. A restart works because by then the cache is warm and
the backlog has drained.

This is a **recurring, already-known** issue (the knexfile comment shows the
team identified materialization as the fix earlier but never did it).

## Fix options

### Option A — Materialized view + scheduled/event-driven refresh (recommended)

Replace the `inherited_user_apps` view with a **materialized view** carrying a
`UNIQUE INDEX (user_id)`. `find WHERE user_id = ?` then becomes an index lookup
on precomputed rows — no per-request recompute.

- **Correctness:** the SELECT is byte-for-byte the current view, so output parity
  is guaranteed by construction (the main correctness risk of Option B is gone).
- **New risk:** staleness. App↔user/group assignments change rarely (admin
  actions), so a short refresh interval is acceptable, but it must be wired up.
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires the unique index and does
  not lock concurrent reads. It costs roughly one full-view compute, but runs in
  the background, off the request path.

DDL sketch (review before use):

```sql
-- inherited_group_apps stays a normal view (cheap-ish, feeds the matview).
DROP VIEW IF EXISTS inherited_user_apps;

CREATE MATERIALIZED VIEW inherited_user_apps AS
  SELECT user_id, jsonb_agg(inherited_apps_ids) AS inherited_apps_ids, user_type
  FROM ( ... exact current SELECT ... )
  GROUP BY user_id, user_type
WITH DATA;

-- Required for REFRESH ... CONCURRENTLY and for the WHERE user_id = ? lookup.
CREATE UNIQUE INDEX inherited_user_apps_user_id_uidx
  ON inherited_user_apps (user_id);
```

Refresh wiring (the part that must NOT be skipped). Two layers:

1. **Scheduled** — `REFRESH MATERIALIZED VIEW CONCURRENTLY inherited_user_apps`
   every ~2 min. There is **no scheduler in this repo today**, so this needs
   `moleculer-cron` (or a guarded `setInterval` in one service instance — beware
   multiple nodes refreshing simultaneously; gate with a Redis lock).
2. **Event-driven** — also refresh right after mutations that change the result:
   `users.apps_ids` / `users.type` / soft-delete, `user_groups` insert/delete,
   `groups.apps_ids` / `groups.parent_id` / soft-delete, and `apps`
   insert/delete (affects SUPER_ADMIN rows). A debounced refresh (coalesce
   bursts into one refresh) keeps admin bulk edits cheap.

Verify there are no duplicate `user_id`s before adding the unique index
(`GROUP BY user_id, user_type` yields one row per user only if each user has a
single `type` — true today, but confirm on prod data).

### Option B — Per-user query rewrite (no migration)

Rewrite `getAppsByUser` to resolve a single user directly: seed a recursive CTE
from *that user's* groups instead of materializing the whole view. Lowest infra
(no matview, no refresh), but it must reproduce the view's logic exactly
(SUPER_ADMIN → all apps, empty `apps_ids` → inherit group apps, else own
`apps_ids`). **Correctness risk is real and security-relevant** — a divergence
silently grants or denies app access — so it needs exhaustive parity testing
against the current view across user shapes. Prefer A unless A's refresh wiring
proves too costly.

### Option C — Mitigations only (already partly in place)

Redis 1h cache + `pool.max: 30` are already deployed; they reduce frequency but
cannot prevent the post-idle cache-expiry thundering herd. Complementary, not a
fix. (medziokle-api now also caches resolved tokens 30s on its side — branch
`feat/auth-token-cache` — which cuts the herd's amplitude but not auth-api's
per-miss cost.)

## Recommendation

**Option A.** Output parity is free; the only new work is refresh wiring, which
is well understood. Pair the matview migration with the refresh mechanism in the
same change set.

## Pre-deploy checklist (auth-api is shared by ALL biip apps — treat as such)

- [ ] Confirm no duplicate `user_id` in the current view output on prod data.
- [ ] Measure full-view compute time on a prod-sized DB (sets the safe refresh
      interval and confirms `CONCURRENTLY` finishes well under it).
- [ ] Implement BOTH refresh layers (scheduled + event-driven) and a multi-node
      guard (Redis lock) before the matview goes live.
- [ ] Load-test the auth path under a cold-cache burst (replay the 04-30 /
      05-12 pattern) and confirm pool no longer saturates.
- [ ] Parity check: matview rows == old view rows for a sample of users of each
      type (USER / ADMIN / SUPER_ADMIN, with/without own `apps_ids`, nested
      groups).
- [ ] Staging soak before any production release; coordinate because every biip
      app authenticates through here.
```
