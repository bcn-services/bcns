// §4.5/§4.6 recursive folder walk (connectors/google.ts) through the real meet + drive pulls. No DB:
// a fake Drive answers files.list per parent from an in-memory tree and honours trashed=false / the meet clause.
import { describe, expect, it } from 'vitest'
import { connectors, SourceError, type Page, type RunContext, type Source } from '../worker/src/connectors/index.js'

const FOLDER = 'application/vnd.google-apps.folder'
const DOC = 'application/vnd.google-apps.document'
const SHORTCUT = 'application/vnd.google-apps.shortcut'

type Node = { id: string; mimeType: string; modifiedTime?: string; trashed?: boolean }
const folder = (id: string): Node => ({ id, mimeType: FOLDER, modifiedTime: '2020-01-01T00:00:00.000Z' })
const doc = (id: string, modifiedTime = '2026-09-01T00:00:00.000Z'): Node => ({ id, mimeType: DOC, modifiedTime })
const pdf = (id: string): Node => ({ id, mimeType: 'application/pdf', modifiedTime: '2026-09-01T00:00:00.000Z' })

function fakeDrive(tree: Record<string, Node[]>, per = 100) {
  const listed: { parent: string; q: string; pageToken: string | null }[] = []
  const exported: string[] = []
  const fetch = (async (url: unknown) => {
    const u = new URL(String(url))
    const exp = /\/files\/([^/]+)\/export$/.exec(u.pathname)
    if (exp) { exported.push(exp[1]); return new Response(`text:${exp[1]}`) }
    const q = u.searchParams.get('q')!
    const parent = /^'([^']+)' in parents/.exec(q)![1]
    const pageToken = u.searchParams.get('pageToken')
    listed.push({ parent, q, pageToken })
    const since = /modifiedTime > '([^']+)'/.exec(q)?.[1]
    const kids = (tree[parent] ?? [])
      .filter(n => !(q.includes('trashed=false') && n.trashed))
      .filter(n => !q.includes(`mimeType='${DOC}'`) || n.mimeType === FOLDER || (n.mimeType === DOC && (!since || n.modifiedTime! > since)))
    const at = Number(pageToken ?? 0)
    const next = at + per < kids.length ? String(at + per) : null
    return new Response(JSON.stringify({ files: kids.slice(at, at + per), nextPageToken: next }))
  }) as unknown as typeof globalThis.fetch
  const logs: [string, unknown][] = []
  const ctx = ({
    clientId: 'c1', source: 'drive' as Source, config: { folder_id: 'root' }, timezone: 'UTC',
    token: { secret: 'test-token' }, fetch,
    log: (event: string, data?: unknown) => logs.push([event, data]),
    putObject: async () => {}, knownMedia: async () => new Set<string>(),
  }) as unknown as RunContext
  return { ctx, listed, exported, logs }
}

async function collect(it: AsyncIterable<Page>): Promise<{ pages: Page[]; error: unknown }> {
  const pages: Page[] = []
  try { for await (const p of it) pages.push(p) } catch (e) { return { pages, error: e } }
  return { pages, error: null }
}
const ids = (pages: Page[], entity: string) => pages.flatMap(p => p.raw.filter(r => r.entity === entity).map(r => r.externalId)).sort()
const chain = (n: number): Record<string, Node[]> => {
  const t: Record<string, Node[]> = { root: [folder('d1')] }
  for (let i = 1; i < n; i++) t[`d${i}`] = [folder(`d${i + 1}`)]
  t[`d${n}`] = [pdf('leaf')]
  return t
}

describe('google folder walk', () => {
  it('meet: finds and exports a doc two levels down; exact q per folder without a cursor', async () => {
    const d = fakeDrive({ root: [doc('top'), folder('sub1')], sub1: [folder('sub2')], sub2: [doc('deep')] })
    const { pages, error } = await collect(connectors.meet.backfill(d.ctx, new Date(0), null))
    expect(error).toBeNull()
    expect(ids(pages, 'drive_file')).toEqual(['deep', 'top'])
    expect(ids(pages, 'doc')).toEqual(['deep', 'top'])
    expect(d.exported.sort()).toEqual(['deep', 'top'])
    expect(pages.flatMap(p => p.raw).find(r => r.entity === 'doc' && r.externalId === 'deep')!.payload.text).toBe('text:deep')
    expect(d.listed.map(l => l.q)).toEqual(['root', 'sub1', 'sub2'].map(id =>
      `'${id}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType='application/vnd.google-apps.document')`))
  })

  it('meet: since clause at every level, folders always listed; cursor = max modifiedTime across the tree', async () => {
    const since = '2026-09-05T00:00:00.000Z'
    const d = fakeDrive({
      root: [doc('old', '2026-09-01T00:00:00.000Z'), doc('mid', '2026-09-06T00:00:00.000Z'), folder('sub1')],
      sub1: [doc('newest', '2026-09-20T00:00:00.000Z'), doc('older', '2026-09-02T00:00:00.000Z')],
    })
    const { pages, error } = await collect(connectors.meet.incremental(d.ctx, { drive_file: { modified_time: since } }))
    expect(error).toBeNull()
    expect(ids(pages, 'drive_file')).toEqual(['mid', 'newest'])
    expect(d.listed.map(l => l.q)).toEqual(['root', 'sub1'].map(id =>
      `'${id}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or (mimeType='application/vnd.google-apps.document' and modifiedTime > '${since}'))`))
    expect(pages.at(-1)!.cursor).toEqual({ modified_time: '2026-09-20T00:00:00.000Z' })
    expect(pages.slice(0, -1).every(p => !p.done && !p.entityDone && Object.keys(p.cursor).length === 0)).toBe(true)
  })

  it('drive: nested ids in pages, exact q, only the last page done/entityDone', async () => {
    const d = fakeDrive({ root: [pdf('a'), folder('s1'), folder('s2')], s1: [pdf('b'), folder('s1a')], s1a: [pdf('c')], s2: [] })
    const { pages, error } = await collect(connectors.drive.backfill(d.ctx, new Date(0), null))
    expect(error).toBeNull()
    expect(ids(pages, 'file')).toEqual(['a', 'b', 'c'])
    expect(d.listed.map(l => l.q)).toEqual(['root', 's1', 's2', 's1a'].map(id => `'${id}' in parents and trashed=false`))
    expect(pages.length).toBe(4)
    expect(pages.map(p => p.done)).toEqual([false, false, false, true])
    expect(pages.map(p => p.entityDone)).toEqual([false, false, false, true])
    expect(typeof pages[3].cursor.pulled_at).toBe('string')
  })

  it('paginates inside a subfolder', async () => {
    const d = fakeDrive({ root: [folder('sub')], sub: [pdf('p1'), pdf('p2'), pdf('p3')] }, 2)
    const { pages, error } = await collect(connectors.drive.backfill(d.ctx, new Date(0), null))
    expect(error).toBeNull()
    expect(ids(pages, 'file')).toEqual(['p1', 'p2', 'p3'])
    expect(d.listed.filter(l => l.parent === 'sub').map(l => l.pageToken)).toEqual([null, '2'])
    expect(pages.map(p => p.done)).toEqual([false, false, true])
  })

  it('never lists a trashed subfolder', async () => {
    const d = fakeDrive({ root: [pdf('a'), { ...folder('bin'), trashed: true }], bin: [pdf('ghost')] })
    const { pages, error } = await collect(connectors.drive.backfill(d.ctx, new Date(0), null))
    expect(error).toBeNull()
    expect(ids(pages, 'file')).toEqual(['a'])
    expect(d.listed.map(l => l.parent)).toEqual(['root'])
  })

  it('lists a folder once on a cycle or a second parent; yields a multi-parent file once', async () => {
    const d = fakeDrive({ root: [folder('A'), folder('B')], A: [folder('B'), folder('root'), pdf('shared')], B: [folder('A'), pdf('shared')] })
    const { pages, error } = await collect(connectors.drive.backfill(d.ctx, new Date(0), null))
    expect(error).toBeNull()
    expect(d.listed.map(l => l.parent)).toEqual(['root', 'A', 'B'])
    expect(ids(pages, 'file')).toEqual(['shared'])
  })

  it('skips shortcuts and logs the count once', async () => {
    const sc = (id: string): Node => ({ id, mimeType: SHORTCUT, modifiedTime: '2026-09-01T00:00:00.000Z' })
    const d = fakeDrive({ root: [pdf('a'), sc('s1'), folder('sub')], sub: [sc('s2'), pdf('b')] })
    const { pages, error } = await collect(connectors.drive.backfill(d.ctx, new Date(0), null))
    expect(error).toBeNull()
    expect(ids(pages, 'file')).toEqual(['a', 'b'])
    expect(d.listed.map(l => l.parent)).toEqual(['root', 'sub'])
    expect(d.logs.filter(([e]) => e === 'google_walk_shortcut_skip')).toEqual([['google_walk_shortcut_skip', { count: 2 }]])
  })

  it('depth cap: 8 levels below the root walk, a 9th throws before any done page', async () => {
    const ok = fakeDrive(chain(8))
    const r8 = await collect(connectors.drive.backfill(ok.ctx, new Date(0), null))
    expect(r8.error).toBeNull()
    expect(ids(r8.pages, 'file')).toEqual(['leaf'])

    const deep = fakeDrive(chain(9))
    const r9 = await collect(connectors.drive.backfill(deep.ctx, new Date(0), null))
    expect(r9.error).toBeInstanceOf(SourceError)
    expect((r9.error as SourceError).message).toBe('folder walk stopped: deeper than 8 levels')
    expect((r9.error as SourceError).status).toBeUndefined()
    expect(r9.pages.some(p => p.done || p.entityDone)).toBe(false)
    expect(deep.logs.some(([e]) => e === 'google_walk_cap')).toBe(true)
  })

  it('folder cap: 500 folders (root included) walk, the 501st throws before any done page', async () => {
    const wide = (n: number) => ({ root: Array.from({ length: n }, (_, i) => folder(`f${i}`)) })
    const ok = fakeDrive(wide(499))
    expect((await collect(connectors.drive.backfill(ok.ctx, new Date(0), null))).error).toBeNull()

    const over = fakeDrive(wide(500))
    const r = await collect(connectors.meet.backfill(over.ctx, new Date(0), null))
    expect(r.error).toBeInstanceOf(SourceError)
    expect((r.error as SourceError).source).toBe('meet')
    expect((r.error as SourceError).message).toBe('folder walk stopped: more than 500 folders under root')
    expect(r.pages.some(p => p.done || p.entityDone)).toBe(false)
    expect(over.logs.filter(([e]) => e === 'google_walk_cap').length).toBe(1)
  })
})
