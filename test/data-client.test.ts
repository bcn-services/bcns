import { describe, expect, it } from 'vitest'
import { createDataClient, DataClientError } from '../packages/data-client/src/index.js'
import { CLIENTS, localKeys, mediaId, signIn, sql, SUPABASE_URL, USERS } from './helpers.js'

async function dataClientAs(user: (typeof USERS)[keyof typeof USERS]) {
  const { token } = await signIn(user)
  return createDataClient({ supabaseUrl: SUPABASE_URL, anonKey: localKeys().anon, accessToken: token })
}

describe('@bcn-services/data-client', () => {
  it('a view read returns only the caller tenant\'s rows', async () => {
    const dc = await dataClientAs(USERS.acmeMember)
    const { data, error } = await dc.views.money_v1()
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    for (const row of data!) expect(row.client_id).toBe(CLIENTS.acme)
  })

  it('rpc.save_record round-trips and rpc.delete_record removes it', async () => {
    const dc = await dataClientAs(USERS.acmeMember)
    const externalId = `dc-test-${Date.now()}`
    const id = await dc.rpc.save_record({ kind: 'note', attributes: { hello: 'world' }, external_id: externalId, title: 'DC test' })
    expect(typeof id).toBe('string')

    const { data: before } = await dc.views.records_v1().eq('id', id)
    expect(before).toHaveLength(1)
    expect(before![0].title).toBe('DC test')

    await dc.rpc.delete_record({ record_id: id })

    const { data: after } = await dc.views.records_v1().eq('id', id)
    expect(after).toHaveLength(0) // records_v1 excludes soft-deleted rows

    const row = await sql('select deleted_at from data.records where id = $1', [id])
    expect(row.rows[0].deleted_at).not.toBeNull()
  })

  it('a cross-tenant download_url throws DataClientError not_found', async () => {
    const dc = await dataClientAs(USERS.acmeMember)
    await expect(dc.rpc.download_url({ media_id: mediaId('beta', 1) })).rejects.toMatchObject({
      code: 'not_found',
      sqlstate: 'BCNS4',
    })
    await expect(dc.rpc.download_url({ media_id: mediaId('beta', 1) })).rejects.toBeInstanceOf(DataClientError)
  })

  it('remove_member as a member throws DataClientError forbidden_role', async () => {
    const dc = await dataClientAs(USERS.acmeMember)
    await expect(dc.rpc.remove_member({ target_user_id: USERS.acmeOwner.id })).rejects.toMatchObject({
      code: 'forbidden_role',
      sqlstate: 'BCNS2',
    })
  })

  it('health() reads client_v1 for the active tenant', async () => {
    const dc = await dataClientAs(USERS.acmeMember)
    const health = await dc.health()
    expect(health).toMatchObject({
      client_id: CLIENTS.acme,
      source: 'platform',
      slug: 'acme',
      status: 'active',
      timezone: 'America/New_York',
    })
    expect(typeof health.egress_quota_bytes).toBe('number')
  })

  it('media.upload stores a file and media.downloadUrl signs it, cleaned up after', async () => {
    const dc = await dataClientAs(USERS.acmeMember)
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
    const file = new File([bytes], `dc-test-${Date.now()}.png`, { type: 'image/png' })

    const mediaIdCreated = await dc.media.upload(file, { title: 'DC upload test', tags: ['dc-test'] })
    expect(typeof mediaIdCreated).toBe('string')

    const url = await dc.media.downloadUrl(mediaIdCreated)
    expect(url).toMatch(/^https?:\/\//)

    const n = await dc.rpc.delete_media({ media_ids: [mediaIdCreated] })
    expect(n).toBe(1)
  })
})
