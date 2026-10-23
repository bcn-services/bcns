// Drive rows carry web_content_link + folder_path. No DB: a fake Drive with named folders.
import { describe, expect, it } from 'vitest'
import { connectors, type Page, type RunContext } from '../worker/src/connectors/index.js'

const FOLDER = 'application/vnd.google-apps.folder'
type Node = { id: string; name: string; mimeType: string; modifiedTime: string; webContentLink?: string }
const folder = (id: string, name: string): Node => ({ id, name, mimeType: FOLDER, modifiedTime: '2020-01-01T00:00:00.000Z' })
const file = (id: string, name: string, webContentLink?: string): Node =>
  ({ id, name, mimeType: 'image/png', modifiedTime: '2026-09-01T00:00:00.000Z', webContentLink })

function ctxFor(tree: Record<string, Node[]>) {
  const fields: string[] = []
  const fetch = (async (url: unknown) => {
    const u = new URL(String(url))
    fields.push(u.searchParams.get('fields')!)
    const parent = /^'([^']+)' in parents/.exec(u.searchParams.get('q')!)![1]
    return new Response(JSON.stringify({ files: tree[parent] ?? [] }))
  }) as unknown as typeof globalThis.fetch
  const ctx = ({
    clientId: 'c1', source: 'drive', config: { folder_id: 'root' }, timezone: 'UTC', token: { secret: 't' }, fetch,
    log: () => {}, putObject: async () => {}, knownMedia: async () => new Set<string>(),
  }) as unknown as RunContext
  return { ctx, fields }
}

async function rows(ctx: RunContext) {
  const pages: Page[] = []
  for await (const p of connectors.drive.backfill(ctx, new Date(0), null)) pages.push(p)
  const media = connectors.drive.normalize(ctx, pages.flatMap(p => p.raw)).media!
  return Object.fromEntries(media.map(m => [m.externalId, m.attributes]))
}

describe('drive media attributes', () => {
  it('folder_path: "" at the root, names joined by "/" below; web_content_link stored or null', async () => {
    const { ctx, fields } = ctxFor({
      root: [file('a', 'a.png', 'https://drive.google.com/uc?id=a&export=download'), folder('s1', 'Sub'), file('n', 'n.png')],
      s1: [file('b', 'b.png'), folder('s2', 'Sub2')],
      s2: [file('c', 'c.png', 'https://drive.google.com/uc?id=c&export=download')],
    })
    const attrs = await rows(ctx)
    expect(attrs.a).toMatchObject({ folder_path: '', web_content_link: 'https://drive.google.com/uc?id=a&export=download' })
    expect(attrs.n).toMatchObject({ folder_path: '', web_content_link: null })
    expect(attrs.b).toMatchObject({ folder_path: 'Sub', web_content_link: null })
    expect(attrs.c).toMatchObject({ folder_path: 'Sub/Sub2', web_content_link: 'https://drive.google.com/uc?id=c&export=download' })
    expect(attrs.a.web_view_link).toBeNull() // the existing key is still there
    expect(fields.every(f => f.includes('webContentLink'))).toBe(true)
  })
})
