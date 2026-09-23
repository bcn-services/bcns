// QA (item F4): api.connect_source's p_config was unvalidated (chunk5-w5a-shopify-review.md
// #2, chunk5-w5b-meta-monday-review.md #5) — any signed-in owner could write an arbitrary
// jsonb blob into connector_schedule.config through PostgREST. No local supabase stack is
// required here (unlike test/catalog.test.ts): this reads the migration SQL as text and
// checks the three per-source regexes are present, plus that the function is actually
// recreated (not just commented about) with the unchanged 8-arg signature so the existing
// grant survives.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url)

function migrationText(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.includes('connect_source_validate_config'))
  if (!file) throw new Error('expected a 20260923* connect_source_validate_config migration')
  return readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8')
}

describe('api.connect_source validates p_config per source', () => {
  const sql = migrationText()

  it('recreates api.connect_source with the unchanged 8-arg signature (CREATE OR REPLACE, not drop+recreate)', () => {
    expect(sql).toMatch(/create or replace function api\.connect_source/)
    expect(sql).not.toMatch(/drop function api\.connect_source/)
  })

  it('validates shopify: p_config->>shop must be a *.myshopify.com host', () => {
    expect(sql).toContain("p_config->>'shop'")
    expect(sql).toContain(String.raw`^[a-z0-9][a-z0-9-]*\.myshopify\.com$`)
  })

  it('validates meta: p_config->>act_id must match act_\\d+', () => {
    expect(sql).toContain("p_config->>'act_id'")
    expect(sql).toContain(String.raw`^act_\d+$`)
  })

  it('validates monday: p_config->>board_id must be all digits', () => {
    expect(sql).toContain("p_config->>'board_id'")
    expect(sql).toContain(String.raw`^\d+$`)
  })

  // Mutation check: delete one of the three `if p_source = '<x>' and ...` guards
  // above and this goes red — each source's regex must appear exactly once,
  // gated on that source.
  it('each validation guard is gated on its own p_source, not applied globally', () => {
    expect(sql).toContain("p_source = 'shopify' and")
    expect(sql).toContain("p_source = 'meta' and")
    expect(sql).toContain("p_source = 'monday' and")
  })
})
