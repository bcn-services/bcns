// Item 8 (hub source settings): the guards in 20261007000400_source_settings.sql, read as text so
// they hold without a local stack. Each guard is asserted against the body of the one function
// that carries it, so deleting a guard turns exactly one assertion red. The DB-backed behaviour
// (roles, tenants, the hour, the lease) is in source-settings.test.ts and runs in CI.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILE = new URL('../supabase/migrations/20261007000400_source_settings.sql', import.meta.url)
const HUB_LIB = new URL('../../apps/connect/lib/source-settings.ts', import.meta.url)

// Comments stripped and whitespace collapsed, so a guard that only survives in a comment fails.
const sql = readFileSync(FILE, 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join(' ')
  .replace(/\s+/g, ' ')
  .toLowerCase()

/** The body of one function, from `create function <name>(` up to its `end $$;`. */
function body(name: string): string {
  const start = sql.indexOf(`create function ${name}(`)
  if (start < 0) throw new Error(`no create function ${name}`)
  const end = sql.indexOf('end $$;', start)
  if (end < 0) throw new Error(`no end $$; after ${name}`)
  return sql.slice(start, end)
}

const API_FNS = {
  'api.source_settings_v1': '',
  'api.connector_runs_v1': 'data.source',
  'api.reset_source_cursors': 'data.source',
  'api.set_source_folder': 'data.source, text, text',
} as const
const WRITERS = ['api.reset_source_cursors', 'api.set_source_folder'] as const
const TARGET_KEYS = ['folder_id', 'notes_url', 'board_url', 'board_id', 'admin_url', 'shop', 'realm_id']
const OWNER_CHECK =
  "if data.active_client_role() is distinct from 'owner' then raise exception using errcode = 'bcns2', message = 'forbidden_role'; end if;"
const LEASE_FREE = '(s.lease_until is null or s.lease_until <= now())'
const HOUR_LIMIT = "(s.last_reset_at is null or s.last_reset_at <= now() - interval '1 hour')"
const CURSOR_RESET = "backfill_cursor = '{}', incremental_cursor = '{}', next_run_at = now()"

describe('20261007000400_source_settings.sql', () => {
  it('adds last_reset_at and folder_changed_at to data.connector_schedule', () => {
    expect(sql).toContain('alter table data.connector_schedule add column last_reset_at timestamptz;')
    expect(sql).toContain('alter table data.connector_schedule add column folder_changed_at timestamptz;')
  })

  for (const [fn, args] of Object.entries(API_FNS)) {
    it(`${fn}: security definer, pinned search_path, tenant from the JWT, authenticated only`, () => {
      const b = body(fn)
      expect(b).toMatch(/security definer set search_path = ''/)
      expect(b).toContain('tenant uuid := data.tenant_or_raise()')
      expect(b).not.toContain('client_id uuid')
      expect(b).not.toContain('source_tokens')
      expect(sql).toContain(`revoke all on function ${fn}(${args}) from public, anon, service_role;`)
      expect(sql).toContain(`grant execute on function ${fn}(${args}) to authenticated;`)
      expect(sql).not.toMatch(new RegExp(`grant execute on function ${fn.replace('.', '\\.')}\\([^)]*\\) to [^;]*(anon|service_role|public)`))
    })
  }

  for (const fn of WRITERS) {
    it(`${fn}: owner only`, () => {
      expect(body(fn)).toContain(OWNER_CHECK)
    })
    it(`${fn}: refused while a sync holds the lease, in the same update`, () => {
      expect(body(fn)).toMatch(new RegExp(`update data\\.connector_schedule s set [^;]* where [^;]*${escape(LEASE_FREE)}`))
    })
  }

  it('reset_source_cursors: once an hour, in the same update', () => {
    expect(body('api.reset_source_cursors')).toMatch(
      new RegExp(`update data\\.connector_schedule s set [^;]* where [^;]*${escape(HOUR_LIMIT)}`)
    )
  })

  it('reset_source_cursors: sets exactly what add-source --reset-cursors sets, plus last_reset_at', () => {
    expect(body('api.reset_source_cursors')).toContain(
      `update data.connector_schedule s set ${CURSOR_RESET}, last_reset_at = now() where`
    )
  })

  it('reset_source_cursors: shopify is refused before any write', () => {
    const b = body('api.reset_source_cursors')
    const refuse = b.indexOf("if p_source = 'shopify' then raise exception using errcode = 'bcns3'")
    expect(refuse).toBeGreaterThan(0)
    expect(refuse).toBeLessThan(b.indexOf('update data.connector_schedule'))
  })

  it('set_source_folder: writes folder_id + notes_url and resets the cursors in the same statement', () => {
    expect(body('api.set_source_folder')).toMatch(
      new RegExp(
        `update data\\.connector_schedule s set config = s\\.config \\|\\| jsonb_build_object\\('folder_id', p_folder_id, 'notes_url', url\\), ${escape(CURSOR_RESET)},`
      )
    )
  })

  it('set_source_folder: is not held to the one-hour limit', () => {
    expect(body('api.set_source_folder')).not.toContain('last_reset_at <=')
  })

  it('set_source_folder: meet and drive only, and the id and link are checked server-side', () => {
    const b = body('api.set_source_folder')
    expect(b).toContain("p_source not in ('meet', 'drive') then raise exception using errcode = 'bcns3'")
    expect(b).toContain("p_folder_id !~ '^[a-za-z0-9_-]{10,128}$'")
    expect(b).toContain("url !~ '^https://drive\\.google\\.com/")
    expect(b).toContain("'https://drive.google.com/drive/folders/' || p_folder_id")
  })

  it('source_settings_v1: target is built from the allow-list only, never from config itself', () => {
    const b = body('api.source_settings_v1')
    const pairs = [...b.matchAll(/'([a-z_]+)', s\.config->'([a-z_]+)'/g)].map((m) => [m[1], m[2]])
    expect(pairs).toEqual(TARGET_KEYS.map((k) => [k, k]))
    // With the allowed reads removed, nothing else in the body may touch config.
    const rest = TARGET_KEYS.reduce((acc, k) => acc.split(`s.config->'${k}'`).join(''), b)
    expect(rest).not.toContain('config')
  })

  it('connector_runs_v1: last 20 runs, no lease_owner', () => {
    const b = body('api.connector_runs_v1')
    expect(b).toContain('order by r.started_at desc limit 20')
    expect(b).not.toContain('lease_owner')
    expect(b).not.toContain('entity_rows')
  })

  it('the refusal helper is unreachable from the api roles', () => {
    expect(sql).toContain(
      'revoke all on function data.source_reset_refused(uuid, data.source) from public, anon, authenticated, service_role;'
    )
    expect(sql).not.toMatch(/grant [^;]* on function data\.source_reset_refused/)
  })

  it('the hub reads the same TARGET_KEYS', () => {
    const hub = readFileSync(HUB_LIB, 'utf8').match(/export const TARGET_KEYS = \[([^\]]*)\]/)
    expect(hub?.[1]?.match(/"([a-z_]+)"/g)?.map((k) => k.slice(1, -1))).toEqual(TARGET_KEYS)
  })
})

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
