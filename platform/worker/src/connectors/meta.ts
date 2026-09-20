// §4.3 Meta Ads — Graph API v21.0, Business Manager system-user token (no expiry).
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  type CanonicalWrites, type Connector, type Json, type MediaRow, type MetricRow, type Page,
  type RawRow, type RecordRow, type RunContext,
  SourceError, reason, minor, sleep,
} from './index.js'

const GRAPH = 'https://graph.facebook.com/v21.0'
const WINDOW_DAYS = 31
const POLLS_PER_RUN = 5

const configSchema = z.object({
  act_id: z.string(),
  account_timezone: z.string().optional(),
  ads_manager_url: z.string().optional(),
  currency: z.string().optional(),
}).passthrough()

const day = (d: Date) => d.toISOString().slice(0, 10)

async function graph(ctx: RunContext, path: string, params: Record<string, string> = {}, init?: RequestInit): Promise<Json> {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', ctx.token.secret)
  const r = await ctx.fetch(url.toString(), init)
  const body = await r.json().catch(() => ({}))
  if (body?.error) throw new SourceError('meta', reason(body, r.status), r.status, body)
  if (!r.ok) throw new SourceError('meta', `HTTP ${r.status}`, r.status, body)
  const util = Number(r.headers.get('x-fb-ads-insights-throttle') ? JSON.parse(r.headers.get('x-fb-ads-insights-throttle')!).acc_id_util_pct : 0)
  if (util > 75) await sleep(60_000)
  return body
}

const INSIGHT_FIELDS = 'spend,impressions,clicks,reach,actions,action_values,purchase_roas'
const LEVEL_FIELDS: Record<string, string> = {
  insight_campaign_day: `campaign_id,campaign_name,${INSIGHT_FIELDS}`,
  insight_ad_day: `ad_id,ad_name,adset_id,campaign_id,${INSIGHT_FIELDS}`,
}
const LEVEL: Record<string, string> = { insight_campaign_day: 'campaign', insight_ad_day: 'ad' }

/** Run-start: the ad account's own timezone + currency (§4.3). */
async function accountMeta(ctx: RunContext): Promise<void> {
  const a = await graph(ctx, ctx.config.act_id, { fields: 'timezone_name,currency' })
  if (a?.timezone_name && (a.timezone_name !== ctx.config.account_timezone || a.currency !== ctx.config.currency)) {
    await ctx.mergeConfig({ account_timezone: a.timezone_name, currency: a.currency })
  }
}

async function* listEntity(ctx: RunContext, entity: 'campaign' | 'ad'): AsyncGenerator<{ raw: RawRow[]; hasNext: boolean }> {
  const fields = entity === 'campaign'
    ? 'id,name,status,effective_status,objective,updated_time'
    : 'id,name,adset_id,campaign_id,status,effective_status,updated_time,creative{id,name,image_hash,thumbnail_url,object_story_spec}'
  let after: string | undefined
  for (;;) {
    const p: Record<string, string> = { fields, limit: '200' }
    if (after) p.after = after
    const b: Json = await graph(ctx, `${ctx.config.act_id}/${entity}s`, p)
    const raw: RawRow[] = (b.data ?? []).map((n: Json) => ({
      entity, externalId: String(n.id), sourceUpdatedAt: n.updated_time ? new Date(n.updated_time) : undefined, payload: n,
    }))
    after = b.paging?.cursors?.after && b.paging?.next ? b.paging.cursors.after : undefined
    yield { raw, hasNext: !!after }
    if (!after) return
  }
}

/** Download creative images that are not already in `media` (§4.3 adimage). */
async function adImages(ctx: RunContext, ads: RawRow[]): Promise<RawRow[]> {
  const byHash = new Map<string, string>()
  for (const a of ads) {
    const h = a.payload?.creative?.image_hash
    if (h && !byHash.has(h)) byHash.set(h, a.payload.creative.name ?? h)
  }
  if (!byHash.size) return []
  const known = await ctx.knownMedia([...byHash.keys()])
  const wanted = [...byHash.keys()].filter(h => !known.has(h))
  if (!wanted.length) return []
  const b: Json = await graph(ctx, `${ctx.config.act_id}/adimages`, {
    hashes: JSON.stringify(wanted), fields: 'hash,url,permalink_url,width,height',
  })
  const out: RawRow[] = []
  for (const img of b.data ?? []) {
    const path = `${ctx.clientId}/orig/${randomUUID()}.jpg`
    const r = await ctx.fetch(img.url)
    if (!r.ok) { ctx.log('adimage_download_failed', { hash: img.hash, status: r.status }); continue }
    const bytes = new Uint8Array(await r.arrayBuffer())
    await ctx.putObject(path, bytes, 'image/jpeg')
    out.push({
      entity: 'adimage', externalId: String(img.hash),
      payload: { ...img, storage_path: path, bytes: bytes.byteLength, creative_name: byHash.get(img.hash) },
    })
  }
  return out
}

async function* insightsIncremental(ctx: RunContext, entity: string, since: Date): AsyncGenerator<{ raw: RawRow[]; hasNext: boolean }> {
  let after: string | undefined
  for (;;) {
    const p: Record<string, string> = {
      level: LEVEL[entity], time_increment: '1', limit: '500', fields: LEVEL_FIELDS[entity],
      time_range: JSON.stringify({ since: day(since), until: day(new Date()) }),
    }
    if (after) p.after = after
    const b: Json = await graph(ctx, `${ctx.config.act_id}/insights`, p)
    yield { raw: insightRows(entity, b.data ?? []), hasNext: !!(b.paging?.next && b.paging?.cursors?.after) }
    after = b.paging?.next ? b.paging?.cursors?.after : undefined
    if (!after) return
  }
}

const insightRows = (entity: string, rows: Json[]): RawRow[] => rows.map((n: Json) => ({
  entity,
  externalId: `${entity === 'insight_ad_day' ? n.ad_id : n.campaign_id}:${n.date_start}`,
  payload: n,
}))

export const meta: Connector = {
  source: 'meta',
  defaults: {
    interval: '6 hours',
    backfillDepth: '13 months',
    rateLimit: { concurrency: 1, minDelayMs: 2000 },
    fullList: [{ entity: 'campaign', table: 'records' }, { entity: 'ad', table: 'records' }],
  },
  configSchema,
  tokenKind: 'meta_system_user',

  async *incremental(ctx: RunContext): AsyncGenerator<Page> {
    await accountMeta(ctx)
    let ads: RawRow[] = []
    for (const entity of ['campaign', 'ad'] as const) {
      for await (const p of listEntity(ctx, entity)) {
        if (entity === 'ad') ads = ads.concat(p.raw)
        yield { raw: p.raw, entity, cursor: { listed_at: new Date().toISOString() }, entityDone: !p.hasNext, done: false }
      }
    }
    const since = new Date(Date.now() - 3 * 864e5) // late attribution window (§4.3)
    for (const entity of ['insight_campaign_day', 'insight_ad_day'] as const) {
      for await (const p of insightsIncremental(ctx, entity, since)) {
        yield { raw: p.raw, entity, cursor: { until: day(new Date()) }, entityDone: !p.hasNext, done: false }
      }
    }
    const images = await adImages(ctx, ads)
    yield { raw: images, entity: 'adimage', cursor: { pulled_at: new Date().toISOString() }, entityDone: true, done: true }
  },

  async *backfill(ctx: RunContext, from: Date, cursor: Json): AsyncGenerator<Page> {
    await accountMeta(ctx)
    let ads: RawRow[] = []
    const resumeAt: string | undefined = cursor?.entity
    const order = ['campaign', 'ad', 'insight_campaign_day', 'insight_ad_day', 'adimage']
    const start = resumeAt ? Math.max(0, order.indexOf(resumeAt)) : 0

    for (const entity of ['campaign', 'ad'] as const) {
      if (order.indexOf(entity) < start) continue
      for await (const p of listEntity(ctx, entity)) {
        if (entity === 'ad') ads = ads.concat(p.raw)
        yield { raw: p.raw, entity, cursor: { entity }, entityDone: !p.hasNext, done: false }
      }
    }

    for (const entity of ['insight_campaign_day', 'insight_ad_day'] as const) {
      if (order.indexOf(entity) < start) continue
      let windowUntil: string = (resumeAt === entity && cursor?.window_until) || day(new Date())
      let runId: string | undefined = resumeAt === entity ? cursor?.report_run_id : undefined
      let after: string | undefined = resumeAt === entity ? cursor?.after : undefined
      for (;;) {
        const untilD = new Date(windowUntil)
        const sinceD = new Date(Math.max(from.getTime(), untilD.getTime() - (WINDOW_DAYS - 1) * 864e5))
        if (untilD < from) break
        if (!runId) {
          const sub: Json = await graph(ctx, `${ctx.config.act_id}/insights`, {
            level: LEVEL[entity], time_increment: '1', limit: '500', fields: LEVEL_FIELDS[entity],
            time_range: JSON.stringify({ since: day(sinceD), until: windowUntil }),
          }, { method: 'POST' })
          runId = String(sub.report_run_id)
          yield { raw: [], entity, cursor: { entity, window_until: windowUntil, report_run_id: runId }, entityDone: false, done: false }
        }
        let ready = false
        for (let i = 0; i < POLLS_PER_RUN; i++) {
          const s: Json = await graph(ctx, runId!, {})
          if (s.async_status === 'Job Completed') { ready = true; break }
          if (s.async_status === 'Job Failed' || s.async_status === 'Job Skipped') {
            throw new SourceError('meta', `insights async job ${s.async_status}`, 200, s)
          }
          await sleep(2000)
        }
        // Still running: keep the report_run_id and let the next tick resume the poll (§4.3).
        if (!ready) { yield { raw: [], entity, cursor: { entity, window_until: windowUntil, report_run_id: runId }, entityDone: false, done: false }; return }
        for (;;) {
          const p: Record<string, string> = { limit: '500' }
          if (after) p.after = after
          const b: Json = await graph(ctx, `${runId}/insights`, p)
          after = b.paging?.next ? b.paging?.cursors?.after : undefined
          yield {
            raw: insightRows(entity, b.data ?? []), entity,
            cursor: { entity, window_until: windowUntil, report_run_id: runId, after }, entityDone: false, done: false,
          }
          if (!after) break
        }
        runId = undefined
        windowUntil = day(new Date(sinceD.getTime() - 864e5))
        if (new Date(windowUntil) < from) break
      }
      yield { raw: [], entity, cursor: { entity }, entityDone: true, done: false }
    }

    const images = await adImages(ctx, ads)
    yield { raw: images, entity: 'adimage', cursor: { entity: 'adimage' }, entityDone: true, done: true }
  },

  normalize(ctx: RunContext, rows: RawRow[]): CanonicalWrites {
    const records: RecordRow[] = [], media: MediaRow[] = [], dailyMetrics: MetricRow[] = []
    const currency = ctx.config.currency ?? 'USD'
    for (const r of rows) {
      const p = r.payload
      if (r.entity === 'campaign') {
        records.push({
          externalId: String(p.id), kind: 'campaign', title: p.name ?? null,
          occurred_at: new Date(p.updated_time ?? Date.now()).toISOString(),
          attributes: { status: p.status ?? null, effective_status: p.effective_status ?? null, objective: p.objective ?? null },
          source_updated_at: p.updated_time ?? null,
        })
      } else if (r.entity === 'ad') {
        records.push({
          externalId: String(p.id), kind: 'ad', title: p.name ?? null,
          occurred_at: new Date(p.updated_time ?? Date.now()).toISOString(),
          attributes: {
            status: p.status ?? null, effective_status: p.effective_status ?? null,
            adset_id: p.adset_id ?? null, campaign_id: p.campaign_id ?? null,
            image_hash: p.creative?.image_hash ?? null,
          },
          source_updated_at: p.updated_time ?? null,
        })
      } else if (r.entity === 'adimage') {
        media.push({
          externalId: String(p.hash), kind: 'image', storage_path: p.storage_path ?? null,
          filename: `${p.creative_name ?? p.hash}.jpg`, mime: 'image/jpeg',
          bytes: p.bytes ?? null, width: p.width ?? null, height: p.height ?? null,
          title: p.creative_name ?? null, tags: ['meta'], attributes: { permalink_url: p.permalink_url ?? null },
        })
      } else if (r.entity === 'insight_campaign_day' || r.entity === 'insight_ad_day') {
        const isAd = r.entity === 'insight_ad_day'
        const spend = minor(p.spend), impressions = Number(p.impressions ?? 0), clicks = Number(p.clicks ?? 0)
        if (spend === 0 && impressions === 0 && clicks === 0) continue // D25
        const act = (arr: Json[] | undefined, t: string) => arr?.find((a: Json) => a.action_type === t)?.value
        const purchases = Number(act(p.actions, 'omni_purchase') ?? act(p.actions, 'purchase') ?? 0)
        const pvalue = act(p.action_values, 'omni_purchase') ?? act(p.action_values, 'purchase')
        const k = { day: p.date_start as string, entity_kind: isAd ? 'ad' : 'campaign', entity_id: String(isAd ? p.ad_id : p.campaign_id) }
        dailyMetrics.push(
          { ...k, metric: 'spend', value: spend, currency },
          { ...k, metric: 'impressions', value: impressions },
          { ...k, metric: 'clicks', value: clicks },
          { ...k, metric: 'reach', value: Number(p.reach ?? 0) },
          { ...k, metric: 'purchases', value: purchases },
        )
        if (pvalue != null) dailyMetrics.push({ ...k, metric: 'purchase_value', value: minor(pvalue), currency })
      }
    }
    return { records, media, dailyMetrics }
  },
}
