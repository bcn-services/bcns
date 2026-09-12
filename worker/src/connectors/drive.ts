// §4.6 Google Drive content library: one folder per client indexed into data.media; the bytes stay
// in Drive (storage_path null, external_id = file id). Same Google OAuth app as §4.5.
import { z } from 'zod'
import {
  type CanonicalWrites, type Connector, type Json, type MediaRow, type Page, type RawRow, type RunContext,
  SourceError,
} from './index.js'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FIELDS = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,imageMediaMetadata(width,height))'

const configSchema = z.object({
  folder_id: z.string(),
  oauth_client_id: z.string().optional(),
}).passthrough()

async function api(ctx: RunContext, url: string): Promise<Response> {
  const r = await ctx.fetch(url, { headers: { Authorization: `Bearer ${ctx.token.secret}` } })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new SourceError('drive', String(body?.error?.message ?? `HTTP ${r.status}`), r.status, body)
  }
  return r
}

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

/** Every run lists the whole folder (like Monday): fullList tombstones need every file seen, not only changed ones. */
async function* pull(ctx: RunContext): AsyncGenerator<Page> {
  let pageToken: string | undefined
  for (;;) {
    const u = new URL(`${DRIVE}/files`)
    // ponytail: one flat folder; walk subfolders with a folder queue in the cursor if a client nests.
    u.searchParams.set('q', `'${ctx.config.folder_id}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`)
    u.searchParams.set('fields', FIELDS)
    u.searchParams.set('pageSize', '100')
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const b: Json = await (await api(ctx, u.toString())).json()

    const files: Json[] = b.files ?? []
    const known = await ctx.knownMedia(files.map(f => String(f.id)))
    const raw: RawRow[] = []
    for (const f of files) {
      // ponytail: thumbnail fetched once per new file id; a file edited in place keeps its old thumb.
      // Upgrade: knownMedia returns source_updated_at, refetch when modifiedTime is newer.
      const thumb_path = known.has(String(f.id)) ? null : await thumb(ctx, f)
      raw.push({ entity: 'file', externalId: String(f.id), sourceUpdatedAt: new Date(f.modifiedTime), payload: { ...f, thumb_path } })
    }
    pageToken = b.nextPageToken ?? undefined
    const done = !pageToken
    yield { raw, entity: 'file', cursor: done ? { pulled_at: new Date().toISOString() } : { pageToken }, entityDone: done, done }
    if (done) return
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

  async refreshToken(ctx): Promise<{ secret: string; expiresAt: Date }> {
    const r = await ctx.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: ctx.token.refresh_secret ?? '',
        client_id: ctx.config.oauth_client_id ?? '',
        client_secret: ctx.token.attributes?.oauth_client_secret ?? '',
      }).toString(),
    })
    const b: Json = await r.json().catch(() => ({}))
    if (!r.ok || b.error) throw new SourceError('drive', String(b.error_description ?? b.error ?? `HTTP ${r.status}`), r.status, b)
    return { secret: String(b.access_token), expiresAt: new Date(Date.now() + Number(b.expires_in ?? 3600) * 1000) }
  },

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
