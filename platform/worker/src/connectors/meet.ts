// §4.5 Google Meet notes — PROVISIONAL. Drive listing + OAuth refresh are documented API
// behaviour; the note format (title suffix, participant block) is unverified until a sample lands.
import { z } from 'zod'
import {
  type CanonicalWrites, type Connector, type Json, type MessageRow, type Page, type RawRow, type RunContext,
  SourceError,
} from './index.js'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

const configSchema = z.object({
  folder_id: z.string(),
  oauth_client_id: z.string().optional(),
  notes_url: z.string().optional(),
}).passthrough()

async function drive(ctx: RunContext, url: string): Promise<Response> {
  const r = await ctx.fetch(url, { headers: { Authorization: `Bearer ${ctx.token.secret}` } })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new SourceError('meet', String(body?.error?.message ?? `HTTP ${r.status}`), r.status, body)
  }
  return r
}

async function* pull(ctx: RunContext, since: Date | null): AsyncGenerator<Page> {
  let pageToken: string | undefined
  let latest = since ? since.getTime() : 0
  for (;;) {
    const q = [
      `'${ctx.config.folder_id}' in parents`,
      `mimeType='application/vnd.google-apps.document'`,
      'trashed=false',
      ...(since ? [`modifiedTime > '${since.toISOString()}'`] : []),
    ].join(' and ')
    const u = new URL(`${DRIVE}/files`)
    u.searchParams.set('q', q)
    u.searchParams.set('fields', 'nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,owners)')
    u.searchParams.set('pageSize', '100')
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const b: Json = await (await drive(ctx, u.toString())).json()

    const raw: RawRow[] = []
    for (const f of b.files ?? []) {
      raw.push({ entity: 'drive_file', externalId: String(f.id), sourceUpdatedAt: new Date(f.modifiedTime), payload: f })
      const text = await (await drive(ctx, `${DRIVE}/files/${f.id}/export?mimeType=text%2Fplain`)).text()
      raw.push({ entity: 'doc', externalId: String(f.id), sourceUpdatedAt: new Date(f.modifiedTime), payload: { ...f, text } })
      latest = Math.max(latest, new Date(f.modifiedTime).getTime())
    }
    pageToken = b.nextPageToken ?? undefined
    const done = !pageToken
    yield {
      raw, entity: 'drive_file',
      cursor: done ? { modified_time: new Date(latest || Date.now()).toISOString() } : { pageToken },
      entityDone: done, done,
    }
    if (done) return
  }
}

/**
 * PROVISIONAL (§4.5, Needs Nate N3): the trailing "Notes by Gemini" suffix and the attendee
 * header block are unverified. Participants stay empty until a real sample exists.
 */
export function parseNotes(name: string, text: string): { title: string; participants: string[] } {
  void text
  return { title: name.replace(/\s*[–-]\s*Notes by Gemini\s*$/i, '').trim(), participants: [] }
}

export const meet: Connector = {
  source: 'meet',
  defaults: {
    interval: '1 hour',
    backfillDepth: 'unbounded',
    rateLimit: { concurrency: 2, minDelayMs: 200 },
  },
  configSchema,
  tokenKind: 'google_oauth_refresh',

  backfill(ctx) { return pull(ctx, null) },
  incremental(ctx, cursors) {
    const c = cursors?.drive_file?.modified_time
    return pull(ctx, c ? new Date(c) : null)
  },

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
    if (!r.ok || b.error) throw new SourceError('meet', String(b.error_description ?? b.error ?? `HTTP ${r.status}`), r.status, b)
    return { secret: String(b.access_token), expiresAt: new Date(Date.now() + Number(b.expires_in ?? 3600) * 1000) }
  },

  normalize(_ctx: RunContext, rows: RawRow[]): CanonicalWrites {
    const messages: MessageRow[] = []
    for (const r of rows) {
      if (r.entity !== 'doc') continue
      const p = r.payload
      const { title, participants } = parseNotes(String(p.name ?? ''), String(p.text ?? ''))
      messages.push({
        externalId: String(p.id), kind: 'meeting_note', title, body: p.text ?? null,
        occurred_at: new Date(p.createdTime ?? p.modifiedTime ?? Date.now()).toISOString(),
        participants, url: p.webViewLink ?? null,
        attributes: { modified_time: p.modifiedTime ?? null, owners: p.owners ?? null },
        source_updated_at: p.modifiedTime ?? null,
      })
    }
    return { messages }
  },
}
