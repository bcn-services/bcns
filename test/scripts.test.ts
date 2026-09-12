// Exercises the bcns-run operator scripts (DESIGN.md §5.10) end to end against the local stack.
// Uses a throwaway client (never acme/beta/gamma) created by onboard and removed by hard-delete.
import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql, PNG_1x1 } from './helpers.js'
import { main as onboard } from '../scripts/onboard.js'
import { main as setQuota } from '../scripts/set-quota.js'
import { main as importMedia } from '../scripts/import-media.js'
import { main as churn } from '../scripts/churn.js'
import { main as hardDelete } from '../scripts/hard-delete.js'

const SLUG = 'zz-script-test'
let clientId: string

afterAll(async () => {
  // Best-effort: remove the throwaway client even if an earlier assertion failed mid-suite.
  try {
    await hardDelete(['--slug', SLUG, '--confirm', SLUG, '--force'])
  } catch {
    /* already gone or never created */
  }
})

describe('scripts', () => {
  it('onboard creates the client, its owning membership, and a smoke user', async () => {
    await onboard(['--slug', SLUG, '--name', 'ZZ Script Test', '--timezone', 'America/New_York'])

    const client = await sql<{ id: string; status: string }>('select id, status from data.clients where slug = $1', [SLUG])
    expect(client.rowCount).toBe(1)
    expect(client.rows[0].status).toBe('active')
    clientId = client.rows[0].id

    const smoke = await sql(
      'select is_smoke from data.memberships where client_id = $1 and is_smoke = true',
      [clientId],
    )
    expect(smoke.rowCount).toBe(1)

    const user = await sql('select id from auth.users where email = $1', [`smoke+${SLUG}@bcn-services.com`])
    expect(user.rowCount).toBe(1)
  })

  it('set-quota updates egress_quota_bytes', async () => {
    await setQuota(['--slug', SLUG, '--gb', '5'])
    const r = await sql<{ egress_quota_bytes: string }>('select egress_quota_bytes from data.clients where slug = $1', [SLUG])
    expect(Number(r.rows[0].egress_quota_bytes)).toBe(5 * 1024 ** 3)
  })

  it('import-media uploads a file and registers it via data.register_media', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bcns-import-'))
    try {
      writeFileSync(join(dir, 'pixel.png'), PNG_1x1)
      await importMedia(['--slug', SLUG, '--dir', dir, '--tags', 'a,b'])

      const r = await sql<{ bytes: string; tags: string[]; storage_path: string }>(
        `select bytes, tags, storage_path from data.media where client_id = $1 and filename = 'pixel.png'`,
        [clientId],
      )
      expect(r.rowCount).toBe(1)
      expect(Number(r.rows[0].bytes)).toBe(PNG_1x1.length)
      expect(r.rows[0].tags.sort()).toEqual(['a', 'b'])
      expect(r.rows[0].storage_path).toMatch(new RegExp(`^${clientId}/orig/[0-9a-f-]{36}\\.png$`))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('churn sets status = churned and stamps churned_at', async () => {
    await churn(['--slug', SLUG])
    const r = await sql<{ status: string; churned_at: string | null }>(
      'select status, churned_at from data.clients where slug = $1',
      [SLUG],
    )
    expect(r.rows[0].status).toBe('churned')
    expect(r.rows[0].churned_at).not.toBeNull()
  })

  it('hard-delete removes the client, its rows, and its storage objects', async () => {
    await hardDelete(['--slug', SLUG, '--confirm', SLUG])

    const client = await sql('select 1 from data.clients where slug = $1', [SLUG])
    expect(client.rowCount).toBe(0)

    const media = await sql('select 1 from data.media where client_id = $1', [clientId])
    expect(media.rowCount).toBe(0)

    const objects = await sql('select 1 from storage.objects where name like $1', [`${clientId}/%`])
    expect(objects.rowCount).toBe(0)
  })
})
