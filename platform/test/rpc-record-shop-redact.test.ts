// api.record_shop_redact (20260924000300_shop_redact.sql): the RPC the shopify-shop-redact
// Edge Function calls in as service_role after it has independently re-verified the Shopify
// HMAC. Two things worth a DB-level test, not just the pure-handler test's injected fake: the
// unique(webhook_id) constraint is what actually makes a replay a no-op, and nobody but
// service_role can reach the RPC at all.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { anonClient, serviceClient, sql } from './helpers.js'

const shops: string[] = []

afterAll(async () => {
  if (shops.length) await sql(`delete from data.privacy_requests where shop = any($1::text[])`, [shops])
})

describe('api.record_shop_redact', () => {
  it('queues one row on a fresh webhook id and returns true', async () => {
    const shop = `rpc-${randomUUID().slice(0, 8)}.myshopify.com`
    shops.push(shop)
    const webhookId = `wh-${randomUUID()}`

    const { data, error } = await serviceClient().rpc('record_shop_redact', { p_shop: shop, p_webhook_id: webhookId })
    expect(error).toBeNull()
    expect(data).toBe(true)

    const r = await sql(`select count(*) n from data.privacy_requests where webhook_id = $1`, [webhookId])
    expect(Number(r.rows[0].n)).toBe(1)
  })

  it('a replay of the same webhook id queues nothing new and returns false', async () => {
    const shop = `rpc-${randomUUID().slice(0, 8)}.myshopify.com`
    shops.push(shop)
    const webhookId = `wh-${randomUUID()}`

    await serviceClient().rpc('record_shop_redact', { p_shop: shop, p_webhook_id: webhookId })
    const { data, error } = await serviceClient().rpc('record_shop_redact', { p_shop: shop, p_webhook_id: webhookId })
    expect(error).toBeNull()
    expect(data).toBe(false)

    const r = await sql(`select count(*) n from data.privacy_requests where webhook_id = $1`, [webhookId])
    expect(Number(r.rows[0].n)).toBe(1)
  })

  it('refuses an anonymous caller: no auth, no path to this RPC', async () => {
    const { error } = await anonClient().rpc('record_shop_redact', { p_shop: 'anon-test.myshopify.com', p_webhook_id: `wh-${randomUUID()}` })
    expect(error).not.toBeNull()
  })

  it('N1: service_role can execute no function in schema api except record_shop_redact, and holds no table/view privileges there', async () => {
    const executable = await sql<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'api' and has_function_privilege('service_role', p.oid, 'execute')`
    )
    expect(executable.rows.map((r) => r.proname)).toEqual(['record_shop_redact'])

    const tableGrants = await sql(
      `select table_name, privilege_type from information_schema.role_table_grants
       where table_schema = 'api' and grantee = 'service_role'`
    )
    expect(tableGrants.rows).toEqual([])
  })
})
