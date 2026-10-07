// §4.6 Google Drive content library: one folder per client indexed into data.media; the bytes stay
// in Drive (storage_path null, external_id = file id). Same Google OAuth app as §4.5.
import { z } from 'zod'
import {
  type CanonicalWrites, type Connector, type Json, type MediaRow, type Page, type RawRow, type RunContext,
} from './index.js'
import { refreshGoogleToken, walkFolder } from './google.js'

const FIELDS = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,imageMediaMetadata(width,height))'

const configSchema = z.object({
  folder_id: z.string().regex(/^[\w-]+$/, 'the id segment of the folder URL, not the URL'),
  oauth_client_id: z.string().optional(),
}).passthrough()

/** Drive's own preview copied under the thumb prefix, so the gallery path is the same as for uploads. Never fails the run. */
async function thumb(ctx: RunContext, f: Json): Promise<string | null> {
  if (!f.thumbnailLink) return null
  const path = `${ctx.clientId}/thumb/${f.id}.jpg`
  try {
    const r = await ctx.fetch(String(f.thumbnailLink).replace(/=s\d+$/, '=s512'), { headers: { Authorization: `Bearer ${ctx.token.secret}` } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    await ctx.putObject(path, new Uint8Array(await r.arrayBuffer()), r.headers.get('content-type') ?? 'image/jpeg')
    return path
  } catch (e) {
    ctx.log('drive_thumb_skip', { id: f.id, error: String(e) })
    return null
  }
}

/** Every run walks the whole tree (like Monday): fullList tombstones need every file seen, not only changed ones. */
async function* pull(ctx: RunContext): AsyncGenerator<Page> {
  for await (const { files, last } of walkFolder(ctx, 'drive', String(ctx.config.folder_id), { fields: FIELDS })) {
    const known = await ctx.knownMedia(files.map(f => String(f.id)))
    const raw: RawRow[] = []
    for (const f of files) {
      // ponytail: thumbnail fetched until one lands (known = row with a thumb); a file edited in place keeps its old thumb.
      // Upgrade: knownMedia returns source_updated_at, refetch when modifiedTime is newer.
      const thumb_path = known.has(String(f.id)) ? null : await thumb(ctx, f)
      raw.push({ entity: 'file', externalId: String(f.id), sourceUpdatedAt: new Date(f.modifiedTime), payload: { ...f, thumb_path } })
    }
    // Only the tree's final page is done: a budget stop or cap throw before it never tombstones.
    yield { raw, entity: 'file', cursor: last ? { pulled_at: new Date().toISOString() } : {}, entityDone: last, done: last }
  }
}

export const drive: Connector = {
  source: 'drive',
  defaults: {
    interval: '1 hour',
    backfillDepth: '0',
    rateLimit: { concurrency: 2, minDelayMs: 200 },
    fullList: [{ entity: 'file', table: 'media' }],
  },
  configSchema,
  tokenKind: 'google_oauth_refresh',

  backfill(ctx) { return pull(ctx) },
  incremental(ctx) { return pull(ctx) },

  refreshToken(ctx) { return refreshGoogleToken(ctx, 'drive') },

  normalize(_ctx: RunContext, rows: RawRow[]): CanonicalWrites {
    const media: MediaRow[] = []
    for (const r of rows) {
      if (r.entity !== 'file') continue
      const p = r.payload
      const mime = String(p.mimeType ?? '')
      media.push({
        externalId: String(p.id),
        kind: mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file',
        filename: String(p.name ?? p.id), title: p.name ?? null, mime: p.mimeType ?? null,
        bytes: p.size != null ? Number(p.size) : null,
        width: p.imageMediaMetadata?.width ?? null, height: p.imageMediaMetadata?.height ?? null,
        thumb_path: p.thumb_path ?? null,
        attributes: { web_view_link: p.webViewLink ?? null },
        source_updated_at: p.modifiedTime ?? null,
      })
    }
    return { media }
  },
}
