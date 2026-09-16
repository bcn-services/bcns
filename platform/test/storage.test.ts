import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sql, pool, signIn, serviceClient, USERS, CLIENTS, origPath, thumbPath, mediaId, PNG_1x1 } from './helpers.js'

afterAll(() => pool.end())

describe('storage', () => {
  it('storage_prefix_isolation', async () => {
    const { client } = await signIn(USERS.acmeMember)
    const bucket = client.storage.from('media')
    expect((await bucket.createSignedUrl(origPath('beta', 1), 60)).error).not.toBeNull()
    expect((await bucket.upload(`${CLIENTS.beta}/orig/${randomUUID()}.png`, PNG_1x1, { contentType: 'image/png' })).error).not.toBeNull()
    expect((await bucket.upload(`${CLIENTS.acme}/thumb/${randomUUID()}.jpg`, PNG_1x1, { contentType: 'image/jpeg' })).error).not.toBeNull()
    const ok = `${CLIENTS.acme}/orig/${randomUUID()}.png`
    const up = await bucket.upload(ok, PNG_1x1, { contentType: 'image/png' })
    expect(up.error).toBeNull()
    await serviceClient().storage.from('media').remove([ok])
  })

  it('thumb_prefix_cross_tenant', async () => {
    const { client } = await signIn(USERS.acmeMember)
    const bucket = client.storage.from('media')
    expect((await bucket.createSignedUrl(thumbPath('beta', 1), 60)).error).not.toBeNull()
    const { data, error } = await bucket.createSignedUrls([thumbPath('acme', 1), thumbPath('acme', 2), thumbPath('acme', 3)], 60)
    expect(error).toBeNull()
    expect(data!.map(d => d.error)).toEqual([null, null, null])
    expect(data!.every(d => d.signedUrl)).toBe(true)
  })

  it('download_ticket_required', async () => {
    const { client } = await signIn(USERS.acmeMember)
    const bucket = client.storage.from('media')
    const path = origPath('acme', 1)
    await sql(`delete from data.download_tickets where client_id = $1`, [CLIENTS.acme])
    expect((await bucket.createSignedUrl(path, 60)).error).not.toBeNull()
    const { data, error } = await client.rpc('download_url', { media_id: mediaId('acme', 1) })
    expect(error).toBeNull()
    expect(data).toMatchObject({ path, expires_in: 300 })
    expect((await bucket.createSignedUrl(path, 60)).error).toBeNull()
    await sql(`update data.download_tickets set expires_at = now() - interval '1 minute' where client_id = $1 and storage_path = $2`, [CLIENTS.acme, path])
    expect((await bucket.createSignedUrl(path, 60)).error).not.toBeNull()
  })

  it('storage_budget_deny', async () => {
    const { client } = await signIn(USERS.acmeMember)
    const bucket = client.storage.from('media')
    const month = (await sql(`select date_trunc('month', now() at time zone timezone)::date m from data.clients where id = $1`, [CLIENTS.acme])).rows[0].m
    const quota = (await sql(`select egress_quota_bytes q from data.clients where id = $1`, [CLIENTS.acme])).rows[0].q
    // ticket issued before the quota is hit
    expect((await client.rpc('download_url', { media_id: mediaId('acme', 2) })).error).toBeNull()
    await sql(`insert into data.egress_ledger (client_id, month, bytes) values ($1, $2, $3)
               on conflict (client_id, month) do update set bytes = excluded.bytes`, [CLIENTS.acme, month, quota])
    try {
      const tickets = (await sql(`select count(*)::int n from data.download_tickets where client_id = $1`, [CLIENTS.acme])).rows[0].n
      const { error } = await client.rpc('download_url', { media_id: mediaId('acme', 3) })
      expect(error?.code).toBe('BCNS1')
      expect((await sql(`select count(*)::int n from data.download_tickets where client_id = $1`, [CLIENTS.acme])).rows[0].n).toBe(tickets)
      expect((await sql(`select bytes from data.egress_ledger where client_id = $1 and month = $2`, [CLIENTS.acme, month])).rows[0].bytes).toBe(String(quota))
      expect((await bucket.createSignedUrl(origPath('acme', 2), 60)).error).toBeNull()
      expect((await bucket.createSignedUrl(thumbPath('acme', 1), 60)).error).toBeNull()
    } finally {
      await sql(`delete from data.egress_ledger where client_id = $1`, [CLIENTS.acme])
      await sql(`delete from data.download_tickets where client_id = $1`, [CLIENTS.acme])
    }
  })
})
