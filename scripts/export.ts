// export --slug --out <dir>  (DESIGN.md §5.10, R35): CSV per canonical table, raw.jsonl streamed
// partition by partition through a server-side cursor, files/ originals — all filtered by client_id.
import { parseArgs } from 'node:util'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type pg from 'pg'
import { die, pgClient, serviceClient, clientIdForSlug, isMain, runMain } from './_lib.js'

export const CANONICAL_TABLES = [
  'customers', 'jobs', 'messages', 'money', 'media', 'media_sets', 'media_set_items', 'products',
  'daily_metrics', 'records',
] as const

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function rawPartitions(db: pg.Pool | pg.PoolClient): Promise<string[]> {
  const r = await db.query<{ relname: string }>(
    `select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'data.raw'::regclass order by 1`)
  return r.rows.map((x) => x.relname)
}

export async function exportClient(db: pg.Pool, clientId: string, out: string): Promise<void> {
  mkdirSync(join(out, 'files'), { recursive: true })
  for (const table of CANONICAL_TABLES) {
    const r = await db.query(`select * from data.${table} where client_id = $1 order by 1`, [clientId])
    const lines = [r.fields.map((f) => f.name).join(',')]
    for (const row of r.rows) lines.push(r.fields.map((f) => csvCell(row[f.name])).join(','))
    writeFileSync(join(out, `${table}.csv`), lines.join('\n') + '\n')
  }

  // raw.jsonl: one partition at a time, server-side cursor, never one result set.
  const jsonl = createWriteStream(join(out, 'raw.jsonl'))
  const conn = await db.connect()
  try {
    for (const part of await rawPartitions(conn)) {
      await conn.query('begin')
      await conn.query(`declare raw_cur no scroll cursor for select * from data.${part} where client_id = $1 order by fetched_at`, [clientId])
      for (;;) {
        const page = await conn.query('fetch 1000 from raw_cur')
        for (const row of page.rows) if (!jsonl.write(JSON.stringify(row) + '\n')) await new Promise((res) => jsonl.once('drain', res))
        if (page.rows.length < 1000) break
      }
      await conn.query('commit')
    }
  } finally {
    conn.release()
    await new Promise((res) => jsonl.end(res))
  }

  // files/: every original this client still has in Storage.
  const admin = serviceClient()
  const media = await db.query<{ storage_path: string; filename: string }>(
    `select storage_path, filename from data.media where client_id = $1 and storage_path is not null`, [clientId])
  for (const m of media.rows) {
    const { data, error } = await admin.storage.from('media').download(m.storage_path)
    if (error) { console.error(`warning: ${m.storage_path}: ${error.message}`); continue }
    writeFileSync(join(out, 'files', m.storage_path.split('/').pop()!), Buffer.from(await data.arrayBuffer()))
  }
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' }, out: { type: 'string' } } })
  const { slug, out } = values
  if (!slug || !out) die('usage: export --slug <slug> --out <dir>')
  const db = pgClient()
  try {
    await exportClient(db, await clientIdForSlug(db, slug), out)
    console.log(`exported ${slug} to ${out}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
