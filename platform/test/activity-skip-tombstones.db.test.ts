// api.activity_v1 skips tombstoned jobs/campaign records (migration 20261107130000). Needs the local stack.
import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from 'vitest'
import { sql } from './helpers.js'

const c = randomUUID()
afterAll(async () => {
  await sql(`delete from data.jobs where client_id = $1`, [c])
  await sql(`delete from data.records where client_id = $1`, [c])
  await sql(`delete from data.clients where id = $1`, [c])
})

const kinds = async () =>
  (await sql(`select kind from api.activity_v1 where client_id = $1 order by kind`, [c])).rows.map(r => r.kind)

it('task_done and campaign leave the feed once deleted_at is set', async () => {
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Activity Fixture', 'UTC')`, [c, `act-${c.slice(0, 8)}`])
  await sql(`insert into data.jobs (client_id, source, external_id, title, is_done, source_updated_at) values ($1, 'monday', 'j1', 'T', true, now())`, [c])
  await sql(`insert into data.records (client_id, source, external_id, kind, title, source_updated_at) values ($1, 'meta', 'c1', 'campaign', 'C', now())`, [c])
  expect(await kinds()).toEqual(['campaign', 'task_done'])
  await sql(`update data.jobs set deleted_at = now() where client_id = $1`, [c])
  await sql(`update data.records set deleted_at = now() where client_id = $1`, [c])
  expect(await kinds()).toEqual([])
})
