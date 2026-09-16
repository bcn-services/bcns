# Drive connector review — `bde7ae0..HEAD`

**Date:** 2026-09-12  **Scope:** 3 commits adding the `drive` connector. No code edits made.
**Critical:** none.

## Important

**I1 — a thumbnail that fails once is lost forever, and no thumbnail can ever be replaced.**
`worker/src/connectors/drive.ts:60` (`known.has(String(f.id)) ? null : await thumb(...)`), gated by
`worker/src/run.ts:197-201`.
`knownMedia` answers "does a media row exist", not "did the bytes land". A transient lh3/Drive 5xx
logs `drive_thumb_skip` (drive.ts:37), the row still lands with `thumb_path null`, and from then on
`known.has(id)` is true forever — the connector never retries. The housekeeping fallback cannot
cover it either: `worker/src/media.ts:12-13` requires `storage_path is not null`, and Drive rows have
`storage_path null` by design. On a first run over thousands of files, every file that hits a blip is
permanently thumbless in the gallery, with no operator remedy short of deleting the row.
*Fix:* `worker/src/run.ts:199` — add `and coalesce(storage_path, thumb_path) is not null` to the
`knownMedia` query. No-op for Meta (it `continue`s on a failed download and writes no row —
`worker/src/connectors/meta.ts:87`), and it makes Drive retry the thumb on the next hourly run.

**I2 — Drive tombstones never get `purge_after`, so rows and their `thumb/` objects are never reclaimed.**
`worker/src/run.ts:327-329` (tombstone sets `deleted_at` only) + `worker/src/media.ts:39`.
The new guard is right (it also makes the query match the partial index
`schema.sql:356 (purge_after) where deleted_at is not null`), but nothing ever sets `purge_after` on a
`drive` row: `api.delete_media` is scoped `source = 'upload'`
(`supabase/migrations/20260912000500_api_rpcs.sql:120`). So `deleted_at is not null and purge_after
< now()` is never true for Drive, the row lives forever, and its `<client>/thumb/<file_id>.jpg`
object is never removed. The orphan sweep does not cover it either — `worker/src/media.ts:49` only
scans `path_tokens[2] = 'orig'`. Same leak for any thumb written by `ctx.putObject` (drive.ts:34)
whose page transaction later rolls back: the upload happens outside `tx()`.
*Fix:* `worker/src/run.ts:327` — `set deleted_at = now(), purge_after = now() + interval '30 days'`
for the `media` table (matching `delete_media`'s grace period); the existing `purge()` then reclaims
both row and object.

**I3 — up to 100 sequential fetches per page, with the budget and the lease checked only between pages.**
`worker/src/connectors/drive.ts:57-62` inside the page loop; budget check at `worker/src/run.ts:285`.
`claim()` takes an 8-minute lease (`run.ts:136`) and nothing renews it; `RUN_BUDGET_MS` defaults to
240 s (`worker/src/tick.ts:56`). One page is 100 files × (200 ms min-delay + latency), and each fetch
may run to the 60 s timeout (`run.ts:156,167`) — a handful of hung thumbnail fetches puts a single
page past 480 s. `worker/src/tick.ts:32` then nulls the expired lease, another tick re-claims, and two
runs list and thumbnail the same folder concurrently. Writes stay safe (the schedule writes are
lease-guarded, upserts are idempotent), but Drive quota and wall-clock double, and the run can
thrash. Meet has the same shape (a per-doc export inside the page loop, `meet.ts:47`), so the fix
belongs in the shared path.
*Fix:* `worker/src/run.ts:266` — inside the existing per-page transaction, add
`update data.connector_schedule set lease_until = now() + interval '8 minutes' where client_id = $1
and source = $2 and lease_owner = $owner`.

**I4 — the drive G2 check does not exclude folders, so a nested folder passes onboarding while the connector indexes nothing.**
`scripts/checklist.ts:71`.
The connector's own query excludes `mimeType != 'application/vnd.google-apps.folder'`
(`drive.ts:48`); the checklist's drive branch drops that clause. DESIGN §4.6 says "Flat folder only"
and this check is the only thing that would catch a client who organised their library into
subfolders — it passes, and the first run produces an empty gallery.
*Fix:* `scripts/checklist.ts:71` — append
`and mimeType != 'application/vnd.google-apps.folder'` to the drive branch (reuse drive.ts:48 verbatim).

## Minor

**M1 — the tombstone un-delete does not clear `purge_after`.** `worker/src/run.ts:330-332`.
Unreachable today (no path sets `purge_after` on a connector-owned row), but if I2 is fixed, a file
that leaves the folder and returns comes back live with a stale past `purge_after`; the next
tombstone then hard-deletes it immediately with no 30-day grace.
*Fix:* `run.ts:330` — `set deleted_at = null, purge_after = null`.

**M2 — `folder_id` is interpolated unescaped into the Drive `q`.** `worker/src/connectors/drive.ts:48`,
schema at `drive.ts:14`; same at `scripts/checklist.ts:71`.
A `'` would change the query's semantics (`x' in parents or '1'='1`). Not a live risk: nothing in
`api.*` writes `connector_schedule.config` (grep of all migrations finds no such RPC) and `drive`
never calls `mergeConfig`, so the only writer is the operator running `onboard`. It is a
config-validation gap, not an injection path — a pasted URL fragment fails as an opaque Drive 400.
*Fix:* `drive.ts:14` — `folder_id: z.string().regex(/^[A-Za-z0-9_-]+$/)`, so onboarding rejects it.

**M3 — the `=s512` rewrite silently no-ops on non-`=s` thumbnail links.** `worker/src/connectors/drive.ts:32`.
`/=s\d+$/` matches `…=s220` but not the `=w200-h190-p-k-nu` form Drive returns for Google-native
files, and `.replace` with no match returns the original — safe, never throws, but you store the
default ~200 px preview instead of 512 px. The new fixture only covers the `=s220` case
(`test/fixtures/drive-sample.json:11`).
*Fix:* `drive.ts:32` — `.replace(/=[swh][\w-]*$/, '=s512')`, or strip after the last `=` and append.

**M4 — `backfill` ignores the `{pageToken}` cursor it writes.** `worker/src/connectors/drive.ts:81`
(`backfill(ctx) { return pull(ctx) }`) vs the cursor emitted at `drive.ts:65` and persisted at
`worker/src/run.ts:256`.
A budget-stopped backfill restarts from page 1 next tick. It still converges (committed rows make
`knownMedia` short-circuit the thumb work on the re-pass), so the cost is O(P²/2) extra list calls;
at 100 files/page that stays under a second per pass until roughly 100k files. The stored cursor is
dead state that reads as resumability.
*Fix:* `drive.ts:81` — `backfill(ctx, _from, cursor) { return pull(ctx, cursor?.pageToken) }`, or drop
the `{pageToken}` branch at `drive.ts:65` and always emit `{ pulled_at }`.

**M5 — enum order diverges between DESIGN and the migrations.** `DESIGN.md:66` now shows
`…,'meet','drive','upload',…` but `supabase/migrations/20260912000100_schema.sql:7` is unchanged and
`20260912000600_drive_source.sql:1` appends `drive` last. A DB built from the DESIGN snippet has a
different enum ordinal than one built from the migrations. Harmless today (nothing orders by
`source`), but the two are no longer the same schema.
*Fix:* `DESIGN.md:66` — leave the `create type` as-is and note the `alter type` in §4.6 instead.

**M6 — DESIGN §5.5 still names only Monday and Meta for the zero-row stale rule.** `DESIGN.md:1089`.
`worker/src/health.ts:60` drives it off `fullListEntities`, which now includes `drive`, so the
behaviour is right and the doc is stale.
*Fix:* `DESIGN.md:1089` — "(Monday, Meta, Drive)".

**M7 — the NOTES rationale for the purge guard describes an unreachable case.** `NOTES.md:81`.
"a dashboard-deleted Drive file that the next run un-deleted" cannot happen: `api.delete_media` only
touches `source = 'upload'` (`api_rpcs.sql:120`) and `api.restore_media` requires `purge_after >
now()` (`api_rpcs.sql:132`), which is null on a Drive row. The guard is still correct — it is what
lets the query use the partial index at `schema.sql:356`.
*Fix:* `NOTES.md:81` — restate the reason as the index predicate.

## Clean

**A1 — tenant isolation of the thumb object path: clean.** `ctx.clientId` is `connector_schedule.client_id`
(a `uuid` column, FK to `data.clients`) returned by `claim()`'s `returning s.*` (`run.ts:138,179`), or a
caller-supplied id in `contextFor` — never source-controlled. `ctx.putObject` (`run.ts:186-189`) passes the
string straight to the service-role storage client, which stores it as a literal `storage.objects.name`, not
a filesystem path, so there is no `..` resolution to exploit. Drive file ids are `[A-Za-z0-9_-]`; even a
hypothetical `/` in one only deepens the key — `(storage.foldername(name))[1]` stays the client uuid and
`[2]` stays `'thumb'`, so `media_read_thumb` (`20260912000300_storage.sql:12-16`) keeps matching and the
prefix cannot be escaped. No cross-client collision (every key is prefixed by the uuid) and no collision
with `media.ts:24`'s upload thumbs (those key on a media row UUID, which no Drive file id can match).

**A3a — the `excl()` coalesce does not wipe or churn the row: clean.** `worker/src/run.ts:64,81`. With
incoming `thumb_path` null, `coalesce(excluded.thumb_path, t.thumb_path)` evaluates to `t.thumb_path`, so
the `set` writes the value back to itself and the `where (…) is distinct from (…)` clause sees no
difference — no wipe, and no hourly rewrite of an unchanged row. `storage_path` and `thumb_path` exist only
in the `media` spec (`run.ts:58`), so no other table is affected. (The "can a thumbnail be replaced" half of
attack 3 is I1 above.)

**A5 — a partial-pagination failure cannot tombstone: clean.** `drive.ts:64` sets `done = !pageToken`, so
`done` is true only on the page that Drive itself terminated. A throw from `api()` (`drive.ts:22`)
propagates out of the `for await` at `run.ts:249` into the catch at `run.ts:311`, and a budget stop breaks
at `run.ts:285` — both leave `done = false`, and `applyTombstones` is called only under `if (done)`
(`run.ts:289`). `applyTombstones` additionally requires every fullList entity to have reported `entityDone`
(`run.ts:281,325`). The one remaining exposure is a genuinely successful listing that returns zero files (a
mistyped or emptied `folder_id`): that soft-deletes the whole library in one run. It is self-healing — the
next complete run's un-delete at `run.ts:330-332` restores everything — and it is the same exposure Monday
already carries, so I am not raising it as a new finding.
