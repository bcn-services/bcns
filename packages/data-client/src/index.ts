// @bcn-services/data-client — thin typed wrappers over supabase-js for the shared-platform dashboard
// contract (DESIGN.md §8). Nothing beyond what §8 lists: views, rpc, media, health.
import { createClient, PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.js'

export type { Database } from './database.types.js'

export interface CreateDataClientOptions {
  supabaseUrl: string
  anonKey: string
  /** Bearer token for the signed-in dashboard user (e.g. from supabase-js auth elsewhere in the
   *  template). Required for anything beyond an anonymous read. Not in DESIGN.md §8's literal
   *  signature — NOTES: taken as the way an already-authenticated session reaches this package,
   *  since §8 says the returned object exposes "nothing else" (no `.auth`).
   *  A function form is passed straight through as supabase-js's `accessToken` client option
   *  (2.116+): a fresh, per-request token with no `.auth` on the underlying client — see `signIn`. */
  accessToken?: string | (() => Promise<string>)
}

// ---- errors (DESIGN.md §3.3) ------------------------------------------------------------------

export type DataClientErrorCode =
  | 'no_tenant'
  | 'budget_reached'
  | 'forbidden_role'
  | 'validation'
  | 'not_found'
  | 'too_large'
  | 'unknown'

const SQLSTATE_CODES: Record<string, DataClientErrorCode> = {
  BCNS0: 'no_tenant',
  BCNS1: 'budget_reached',
  BCNS2: 'forbidden_role',
  BCNS3: 'validation',
  BCNS4: 'not_found',
  BCNS5: 'too_large',
}

export class DataClientError extends Error {
  readonly code: DataClientErrorCode
  readonly sqlstate: string
  readonly details: string
  readonly hint: string

  constructor(pgError: PostgrestError) {
    super(pgError.message)
    this.name = 'DataClientError'
    this.sqlstate = pgError.code
    this.code = SQLSTATE_CODES[pgError.code] ?? 'unknown'
    this.details = pgError.details
    this.hint = pgError.hint
  }
}

// ---- views (DESIGN.md §3.2) -------------------------------------------------------------------

type Api = Database['api']
type ViewName = keyof Api['Views']

// Hardcoded from supabase/migrations/20260912000400_api_views.sql — a new view needs an entry here.
const VIEW_NAMES = [
  'client_v1',
  'money_v1',
  'daily_metrics_v1',
  'daily_summary_v1',
  'campaign_daily_v1',
  'creative_daily_v1',
  'products_v1',
  'customers_v1',
  'jobs_v1',
  'messages_v1',
  'records_v1',
  'media_v1',
  'media_sets_v1',
  'media_set_items_v1',
  'activity_v1',
  'connector_health_v1',
  'egress_status_v1',
  'memberships_v1',
] as const satisfies readonly ViewName[]

function viewBuilder<K extends ViewName>(client: SupabaseClient<Database, 'api'>, name: K) {
  // `columns` narrows the fetched fields; rows stay typed as the full view row.
  return (columns = '*') => client.from(name).select(columns as '*')
}

type ViewsNamespace = { [K in (typeof VIEW_NAMES)[number]]: ReturnType<typeof viewBuilder<K>> }

function buildViews(client: SupabaseClient<Database, 'api'>): ViewsNamespace {
  const out = {} as ViewsNamespace
  for (const name of VIEW_NAMES) (out as any)[name] = viewBuilder(client, name)
  return out
}

// ---- rpc (DESIGN.md §3.3) ----------------------------------------------------------------------

type Functions = Api['Functions']
type RpcName = keyof Functions

// Hardcoded from supabase/migrations/20260912000500_api_rpcs.sql — a new RPC needs an entry here.
const RPC_NAMES = [
  'save_record',
  'delete_record',
  'register_upload',
  'update_media',
  'bulk_tag',
  'delete_media',
  'restore_media',
  'create_media_set',
  'update_media_set',
  'delete_media_set',
  'set_media_set_items',
  'reorder_media_set_items',
  'download_url',
  'report_dashboard_version',
  'remove_member',
  'log_mcp_call',
  'get_ai_settings',
  'ai_last_used_at',
  'set_ai_settings',
  'source_settings_v1',
  'connector_runs_v1',
  'reset_source_cursors',
  'set_source_folder',
] as const satisfies readonly RpcName[]

// A function with no arguments is generated as `Args: never`; it is called with none.
type RpcNamespace = {
  [K in (typeof RPC_NAMES)[number]]: [Functions[K]['Args']] extends [never]
    ? () => Promise<Functions[K]['Returns']>
    : (args: Functions[K]['Args']) => Promise<Functions[K]['Returns']>
}

function buildRpc(client: SupabaseClient<Database, 'api'>): RpcNamespace {
  const out = {} as RpcNamespace
  for (const name of RPC_NAMES) {
    ;(out as any)[name] = async (args: unknown) => {
      const { data, error } = await client.rpc(name as any, args as any)
      if (error) throw new DataClientError(error)
      return data
    }
  }
  return out
}

// ---- media (DESIGN.md §2.5, §3.3) ---------------------------------------------------------------

export interface MediaUploadOptions {
  title?: string
  tags?: string[]
}

/** client_id claim from an authenticated JWT (decode-only, no verification — the server verifies). */
function decodeClientId(accessToken: string | undefined): string {
  if (!accessToken) throw new Error('createDataClient: accessToken required for this call')
  const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'))
  if (typeof claims.client_id !== 'string') throw new Error('access token has no client_id claim')
  return claims.client_id
}

function extFromFile(file: File | Blob): string {
  const name = 'name' in file ? (file as File).name : ''
  const dot = name.lastIndexOf('.')
  const raw = dot > -1 ? name.slice(dot + 1) : file.type.split('/')[1] ?? ''
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
  return cleaned || 'bin'
}

function buildMedia(client: SupabaseClient<Database, 'api'>, rpc: RpcNamespace, getToken: () => Promise<string | undefined>) {
  return {
    /** Storage upload to `<client_id>/orig/<uuid>.<ext>`, then `register_upload`. Returns the media id. */
    async upload(file: File | Blob, opts: MediaUploadOptions = {}): Promise<string> {
      const clientId = decodeClientId(await getToken())
      const path = `${clientId}/orig/${crypto.randomUUID()}.${extFromFile(file)}`
      const { error } = await client.storage.from('media').upload(path, file)
      if (error) throw error
      return rpc.register_upload({ path, title: opts.title, tags: opts.tags })
    },

    /** `download_url` (mints a 5-min egress ticket) then `createSignedUrl(path, 300)`. */
    async downloadUrl(mediaId: string): Promise<string> {
      const ticket = (await rpc.download_url({ media_id: mediaId })) as { path: string }
      const { data, error } = await client.storage.from('media').createSignedUrl(ticket.path, 300)
      if (error) throw error
      return data.signedUrl
    },

    /** Thumbnails: no ticket, `createSignedUrls` in batches of 100. Returns path -> signed URL
     *  (null on a per-path error). NOTES: DESIGN.md doesn't state a thumbnail URL lifetime —
     *  reused the 300s (5 min) already used for `download_url`'s ticket. */
    async thumbUrls(paths: string[]): Promise<Record<string, string | null>> {
      const out: Record<string, string | null> = {}
      for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100)
        const { data, error } = await client.storage.from('media').createSignedUrls(batch, 300)
        if (error) throw error
        for (const row of data) if (row.path) out[row.path] = row.signedUrl
      }
      return out
    },
  }
}

// ---- createDataClient ---------------------------------------------------------------------------

export interface DataClient {
  views: ViewsNamespace
  rpc: RpcNamespace
  media: ReturnType<typeof buildMedia>
  health: () => Promise<Api['Views']['client_v1']['Row']>
}

/** Typed supabase-js client scoped to schema `api` only, wrapped per DESIGN.md §8. Nothing else. */
export function createDataClient(opts: CreateDataClientOptions): DataClient {
  const tokenFn = typeof opts.accessToken === 'function' ? opts.accessToken : undefined
  const tokenStr = typeof opts.accessToken === 'string' ? opts.accessToken : undefined

  const client = createClient<Database, 'api'>(opts.supabaseUrl, opts.anonKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(tokenFn ? { accessToken: tokenFn } : {}),
    ...(tokenStr ? { global: { headers: { Authorization: `Bearer ${tokenStr}` } } } : {}),
  })

  const rpc = buildRpc(client)
  const getToken = tokenFn ?? (async () => tokenStr)

  return {
    views: buildViews(client),
    rpc,
    media: buildMedia(client, rpc, getToken),
    async health() {
      const { data, error } = await client.from('client_v1').select('*').single()
      if (error) throw new DataClientError(error)
      return data
    },
  } as DataClient
}

// ---- signIn (DESIGN.md §8 — agent/dashboard auth, no invite mail needed) -----------------------

export interface SignInOptions {
  supabaseUrl: string
  anonKey: string
  email: string
  password: string
}

export interface SignedInDataClient extends DataClient {
  /** Current access token; refreshes when within 60s of expiry. */
  accessToken(): Promise<string>
}

/** One private auth client, one password sign-in. Reused for `createDataClient`'s per-request
 *  token getter — see DESIGN.md §8's Agent-tools addition. */
export async function signIn(opts: SignInOptions): Promise<SignedInDataClient> {
  const auth = createClient(opts.supabaseUrl, opts.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const first = await auth.auth.signInWithPassword({ email: opts.email, password: opts.password })
  if (first.error || !first.data.session) throw new Error(`sign-in failed: ${first.error?.message ?? 'no session'}`)
  decodeClientId(first.data.session.access_token) // throws 'access token has no client_id claim'

  let session = first.data.session
  let inFlight: Promise<string> | null = null

  async function refreshOrSignIn(): Promise<string> {
    const refreshed = await auth.auth.refreshSession({ refresh_token: session.refresh_token })
    if (!refreshed.error && refreshed.data.session) {
      session = refreshed.data.session
      return session.access_token
    }
    const retry = await auth.auth.signInWithPassword({ email: opts.email, password: opts.password })
    if (retry.error || !retry.data.session) throw new Error(`sign-in failed: ${retry.error?.message ?? 'no session'}`)
    session = retry.data.session
    return session.access_token
  }

  async function accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    if (session.expires_at !== undefined && session.expires_at - 60 > now) return session.access_token
    if (!inFlight) {
      inFlight = refreshOrSignIn()
        .then((token) => { inFlight = null; return token })
        .catch((err) => { inFlight = null; throw err })
    }
    return inFlight
  }

  return { ...createDataClient({ supabaseUrl: opts.supabaseUrl, anonKey: opts.anonKey, accessToken }), accessToken }
}

// ---- agent tools (SDK-agnostic; DESIGN.md §8 agent addition) ------------------------------------

export type AgentViewName = ViewName
export type AgentRpcName = 'save_record' | 'update_media' | 'bulk_tag'

export interface AgentToolsOptions {
  views?: AgentViewName[]
  rpcs?: AgentRpcName[]
  /** Per-view column allowlist. A view listed here can only be read, filtered or range-queried on
   *  these columns, and selects exactly them when the caller names none. A view not listed (or no
   *  `columns` at all) behaves as before: any column, `select *`. */
  columns?: Partial<Record<AgentViewName, string[]>>
}

export type JSONSchemaObject = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties: false
}

/** MCP-style tool hints, carried untouched for adapters that want them (agentTools() sets none). */
export interface AgentToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface AgentTool {
  name: string
  description: string
  input_schema: JSONSchemaObject
  title?: string
  annotations?: AgentToolAnnotations
}

export class ToolInputError extends Error {}

/** User ids / customer PII stay out of model context unless a repo opts in via `views`. */
const DEFAULT_AGENT_VIEWS = VIEW_NAMES.filter(
  (v): v is AgentViewName => v !== 'memberships_v1' && v !== 'customers_v1',
)

/** Hardcoded from supabase/migrations/20260912000400_api_views.sql — a new view needs an entry
 *  (or none, if it has no natural date column) here and in VIEW_DESCRIPTIONS. */
const VIEW_DATE_COLUMN: Partial<Record<ViewName, string>> = {
  daily_summary_v1: 'day',
  daily_metrics_v1: 'day',
  campaign_daily_v1: 'day',
  creative_daily_v1: 'day',
  money_v1: 'occurred_at',
  activity_v1: 'occurred_at',
  messages_v1: 'occurred_at',
  records_v1: 'occurred_at',
  media_v1: 'created_at',
  media_sets_v1: 'created_at',
  jobs_v1: 'source_updated_at',
}

/** A column set unique within one tenant (RLS leaves a single client_id), appended to every sort so
 *  offset pages never overlap or skip on tied values. Checked against platform/supabase/migrations:
 *  `id`/`client_id`/`user_id` are primary keys; daily_metrics, media_set_items and connector_health are
 *  their tables' composite primary keys minus client_id; daily_summary is one row per (client_id, day);
 *  campaign/creative daily group by (client_id, day, entity) and left-join tables unique on
 *  (client_id, source, external_id); activity_v1 unions five tables, so `kind` (one source table each)
 *  is added to `ref_id` to make the pair provably unique. Used only to order, never returned. */
const VIEW_KEY: Record<ViewName, string[]> = {
  client_v1: ['client_id'],
  money_v1: ['id'],
  daily_metrics_v1: ['day', 'source', 'entity_kind', 'entity_id', 'metric'],
  daily_summary_v1: ['day'],
  campaign_daily_v1: ['day', 'campaign_id'],
  creative_daily_v1: ['day', 'ad_id'],
  products_v1: ['id'],
  customers_v1: ['id'],
  jobs_v1: ['id'],
  messages_v1: ['id'],
  records_v1: ['id'],
  media_v1: ['id'],
  media_sets_v1: ['id'],
  media_set_items_v1: ['set_id', 'media_id'],
  activity_v1: ['ref_id', 'kind'],
  connector_health_v1: ['source'],
  egress_status_v1: ['client_id'],
  memberships_v1: ['user_id'],
}

const VIEW_DESCRIPTIONS: Record<ViewName, string> = {
  client_v1: 'Tenant identity, timezone, status, egress quota. One row.',
  money_v1: 'Orders, refunds, payouts ledger.',
  daily_metrics_v1: 'Per-day metric rows (sessions, spend, impressions, …).',
  daily_summary_v1: 'One row per day: revenue, orders, ad spend/purchases rollup.',
  campaign_daily_v1: 'Meta ad campaign daily performance.',
  creative_daily_v1: 'Meta ad creative daily performance.',
  products_v1: 'Product catalog.',
  customers_v1: 'Customer directory (PII — excluded by default).',
  jobs_v1: 'Task/job records from connected sources.',
  messages_v1: 'Meeting notes and messages.',
  records_v1: 'Free-form saved records, including AI-generated briefings.',
  media_v1: 'Uploaded and synced media files.',
  media_sets_v1: 'Media collections.',
  media_set_items_v1: 'Media-set membership rows.',
  activity_v1: 'Unified activity feed across connected sources.',
  connector_health_v1: 'Per-connector sync status.',
  egress_status_v1: 'Download-budget usage.',
  memberships_v1: 'User/role rows (user ids — excluded by default).',
}

const MAX_OFFSET = 10_000
const MAX_GROUP_BY = 3
/** Rows pulled per request: PostgREST's `max_rows` on Supabase. */
const PAGE_SIZE = 1000
/** Most rows summarize_view will read for one answer.
 *  ponytail: app-side scan capped at 10k rows — upgrade to a security-invoker SQL function or
 *  PostgREST aggregates if a client outgrows it. */
const SCAN_ROW_CAP = 10_000

const COLUMN_RE = /^[a-z_][a-z0-9_]{0,62}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RpcFieldSchema = { type: string; format?: string; items?: { type: string; format?: string }; maxItems?: number }

/** Hand-written type/shape check for one RPC field against its schema — no schema library. */
function checkRpcField(field: string, value: unknown, schema: RpcFieldSchema): void {
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new ToolInputError(`bad ${field}: expected string`)
    if (schema.format === 'uuid' && !UUID_RE.test(value)) throw new ToolInputError(`bad ${field}: not a uuid`)
  } else if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ToolInputError(`bad ${field}: expected object`)
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new ToolInputError(`bad ${field}: expected array`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      throw new ToolInputError(`bad ${field}: exceeds max of ${schema.maxItems} items`)
    }
    for (const item of value) {
      if (schema.items?.type === 'string') {
        if (typeof item !== 'string') throw new ToolInputError(`bad ${field}: expected string items`)
        if (schema.items.format === 'uuid' && !UUID_RE.test(item)) throw new ToolInputError(`bad ${field}: item not a uuid`)
      }
    }
  }
}

function agentViews(opts?: AgentToolsOptions): AgentViewName[] {
  return opts?.views ?? DEFAULT_AGENT_VIEWS
}

function viewLines(opts?: AgentToolsOptions): string {
  return agentViews(opts)
    .map((v) => {
      const dateCol = VIEW_DATE_COLUMN[v as ViewName]
      const cols = opts?.columns?.[v as ViewName]
      return `- ${v}: ${VIEW_DESCRIPTIONS[v as ViewName]}${dateCol ? ` (date column: ${dateCol})` : ''}${cols ? ` (columns: ${cols.join(', ')})` : ''}`
    })
    .join('\n')
}

const FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const
type FilterOp = (typeof FILTER_OPS)[number]

const FILTERS_SCHEMA = {
  type: 'array',
  maxItems: 10,
  items: {
    type: 'object',
    properties: {
      column: { type: 'string' },
      value: {},
      op: { type: 'string', enum: FILTER_OPS, description: 'default eq; contains = case-insensitive substring, strings only' },
    },
    required: ['column', 'value'],
  },
}

function readViewTool(opts?: AgentToolsOptions): AgentTool {
  const views = agentViews(opts)
  return {
    name: 'read_view',
    description:
      `Read rows from a bcns platform view, scoped to the caller's tenant by row-level security. ` +
      `For "top N" use order_by + order + limit; use offset (with order_by or the date column) for the next page; pages are consistent only if the data does not change between requests. ` +
      `For totals or counts across many rows use summarize_view, not this tool.\n${viewLines(opts)}`,
    input_schema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: views },
        columns: { type: 'array', items: { type: 'string' } },
        filters: FILTERS_SCHEMA,
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        order_by: { type: 'string', description: "column to sort by; default is the view's date column" },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'default desc' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        offset: { type: 'integer', minimum: 0, maximum: MAX_OFFSET },
      },
      required: ['view'],
      additionalProperties: false,
    },
  }
}

const METRICS = ['count', 'sum', 'avg', 'min', 'max'] as const
type Metric = (typeof METRICS)[number]
const PERIODS = ['day', 'month', 'year'] as const
type Period = (typeof PERIODS)[number]
const SUMMARY_ORDERS = ['value_desc', 'value_asc', 'key'] as const

function summarizeViewTool(opts?: AgentToolsOptions): AgentTool {
  return {
    name: 'summarize_view',
    description:
      `Count, sum, average, min or max a numeric column of a bcns platform view, optionally grouped by up to 3 columns ` +
      `and/or by day, month or year (UTC) of the view's date column. Use it for totals such as "refunds by month". ` +
      `Money columns ending in _minor are in minor units and are grouped by currency automatically; so is the value column of daily_metrics_v1, by metric and currency. Free-text and json columns cannot be grouped or aggregated. ` +
      `Scans at most ${SCAN_ROW_CAP} matching rows, in several requests, so totals are exact only if the data does not change during the scan; if partial is true, narrow the date range or filters.\n${viewLines(opts)}`,
    input_schema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: agentViews(opts) },
        metric: { type: 'string', enum: METRICS },
        column: { type: 'string', description: 'numeric column to aggregate; required unless metric is count' },
        group_by: { type: 'array', maxItems: MAX_GROUP_BY, items: { type: 'string' } },
        period: { type: 'string', enum: PERIODS, description: "bucket the view's date column (UTC)" },
        filters: FILTERS_SCHEMA,
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        order: { type: 'string', enum: SUMMARY_ORDERS, description: 'default value_desc' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'max groups returned, default 50' },
      },
      required: ['view', 'metric'],
      additionalProperties: false,
    },
  }
}

const RPC_TOOL_SCHEMAS: Record<AgentRpcName, JSONSchemaObject> = {
  save_record: {
    type: 'object',
    properties: {
      kind: { type: 'string' },
      attributes: { type: 'object' },
      external_id: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      occurred_at: { type: 'string' },
    },
    required: ['kind', 'attributes'],
    additionalProperties: false,
  },
  update_media: {
    type: 'object',
    properties: {
      media_id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    },
    required: ['media_id'],
    additionalProperties: false,
  },
  bulk_tag: {
    type: 'object',
    properties: {
      media_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 500 },
      add: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      remove: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    },
    required: ['media_ids'],
    additionalProperties: false,
  },
}

const RPC_TOOL_DESCRIPTIONS: Record<AgentRpcName, string> = {
  save_record: 'Save (upsert) a free-form record for this tenant, visible via records_v1.',
  update_media: 'Rename/retag one of this tenant\'s media items.',
  bulk_tag: 'Add or remove tags on up to 500 of this tenant\'s media items.',
}

/** Tool defs for the given options — always `read_view` and `summarize_view`, plus one tool per opted-in RPC (default
 *  none: a read-only agent). Destructive/egress/admin RPCs are never exposed. */
export function agentTools(opts?: AgentToolsOptions): AgentTool[] {
  const tools: AgentTool[] = [readViewTool(opts), summarizeViewTool(opts)]
  for (const name of opts?.rpcs ?? []) {
    tools.push({ name, description: RPC_TOOL_DESCRIPTIONS[name], input_schema: RPC_TOOL_SCHEMAS[name] })
  }
  return tools
}

function checkColumn(name: string): void {
  if (!COLUMN_RE.test(name)) throw new ToolInputError(`bad column name: ${name}`)
}

function checkFilterValue(value: unknown): void {
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
    throw new ToolInputError(`bad filter value: ${JSON.stringify(value)}`)
  }
}

function checkDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new ToolInputError(`bad ${field}: ${JSON.stringify(value)}`)
  // A real calendar day (2026-02-31 would roll over to March) in 0001-9998, so addOneDay stays a 4-digit year.
  const year = Number(value.slice(0, 4))
  const day = new Date(`${value}T00:00:00Z`)
  if (year < 1 || year > 9998 || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) {
    throw new ToolInputError(`bad ${field}: ${JSON.stringify(value)}`)
  }
  return value
}

function addOneDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

type Row = Record<string, unknown>

/** The slice of a supabase-js filter builder these tools use; awaiting it runs the request. */
interface ViewQuery extends PromiseLike<{ data: Row[] | null; error: PostgrestError | null }> {
  eq(column: string, value: unknown): ViewQuery
  neq(column: string, value: unknown): ViewQuery
  is(column: string, value: null): ViewQuery
  not(column: string, operator: 'is', value: null): ViewQuery
  gt(column: string, value: unknown): ViewQuery
  gte(column: string, value: unknown): ViewQuery
  lt(column: string, value: unknown): ViewQuery
  lte(column: string, value: unknown): ViewQuery
  ilike(column: string, pattern: string): ViewQuery
  order(column: string, opts: { ascending: boolean }): ViewQuery
  range(from: number, to: number): ViewQuery
  limit(count: number): ViewQuery
}

function viewQuery(client: DataClient, view: string, selectCols: string): ViewQuery {
  // Cast: DataClient.views is typed per view; the view name was already checked against the exposed set.
  return (client.views as unknown as Record<string, (columns?: string) => ViewQuery>)[view](selectCols)
}

/** The one gate every column a tool names goes through — select, filter, sort, group, metric, date
 *  range. Each is a way to learn hidden values, so each gets the same shape and allowlist check. */
function columnGuard(view: string, allow: string[] | undefined): (column: unknown) => string {
  return (column) => {
    if (typeof column !== 'string') throw new ToolInputError(`bad column name: ${JSON.stringify(column)}`)
    checkColumn(column)
    if (allow && !allow.includes(column)) throw new ToolInputError(`column not available on ${view}: ${column}`)
    return column
  }
}

interface ViewContext {
  view: ViewName
  dateCol: string | undefined
  allow: string[] | undefined
  guard: (column: unknown) => string
}

function resolveView(view: unknown, opts?: AgentToolsOptions): ViewContext {
  if (typeof view !== 'string' || !agentViews(opts).includes(view as AgentViewName)) {
    throw new ToolInputError(`unknown or unexposed view: ${String(view)}`)
  }
  const allow = opts?.columns?.[view as ViewName]
  return { view: view as ViewName, dateCol: VIEW_DATE_COLUMN[view as ViewName], allow, guard: columnGuard(view, allow) }
}

interface ParsedFilter {
  column: string
  op: FilterOp
  value: unknown
}

function parseFilters(filters: unknown, guard: ViewContext['guard']): ParsedFilter[] {
  if (filters === undefined) return []
  if (!Array.isArray(filters) || filters.length > 10) throw new ToolInputError('filters must be an array of at most 10 entries')
  return filters.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || typeof (entry as Row).column !== 'string') throw new ToolInputError('bad filter')
    const { column, value, op = 'eq' } = entry as Row
    const checked = guard(column)
    checkFilterValue(value)
    if (typeof op !== 'string' || !(FILTER_OPS as readonly string[]).includes(op)) throw new ToolInputError(`bad filter op: ${JSON.stringify(op)}`)
    const filterOp = op as FilterOp
    if (filterOp === 'contains' && typeof value !== 'string') throw new ToolInputError('contains needs a string value')
    if (filterOp !== 'eq' && filterOp !== 'neq' && value === null) throw new ToolInputError(`${filterOp} needs a non-null value`)
    return { column: checked, op: filterOp, value }
  })
}

function applyFilter(q: ViewQuery, f: ParsedFilter): ViewQuery {
  switch (f.op) {
    // PostgREST reads `eq.null` as the text 'null', so a null value is IS NULL / IS NOT NULL instead.
    case 'eq': return f.value === null ? q.is(f.column, null) : q.eq(f.column, f.value)
    case 'neq': return f.value === null ? q.not(f.column, 'is', null) : q.neq(f.column, f.value)
    case 'gt': return q.gt(f.column, f.value)
    case 'gte': return q.gte(f.column, f.value)
    case 'lt': return q.lt(f.column, f.value)
    case 'lte': return q.lte(f.column, f.value)
    // % _ \ in the value are literal text, not LIKE wildcards. (PostgREST also reads `*` as `%` in
    // like/ilike and has no escape for it; a stray `*` only widens the match inside an allowed column.)
    case 'contains': return q.ilike(f.column, `%${String(f.value).replace(/[\\%_]/g, '\\$&')}%`)
  }
}

/** date_from/date_to as filters on the view's date column. `day` is a date; the rest are timestamps,
 *  so date_to is exclusive of the next day. */
function applyRange(q: ViewQuery, dateCol: string | undefined, dateFrom: unknown, dateTo: unknown): ViewQuery {
  if (dateFrom !== undefined) q = q.gte(dateCol as string, checkDate(dateFrom, 'date_from'))
  if (dateTo !== undefined) {
    const d = checkDate(dateTo, 'date_to')
    q = dateCol === 'day' ? q.lte(dateCol, d) : q.lt(dateCol as string, addOneDay(d))
  }
  return q
}

/** Sort by `sortCol` (if any), then by the view's unique key so equal values keep one fixed order. */
function applyOrder(q: ViewQuery, view: ViewName, sortCol: string | undefined, ascending: boolean): ViewQuery {
  if (sortCol) q = q.order(sortCol, { ascending })
  for (const k of VIEW_KEY[view]) if (k !== sortCol) q = q.order(k, { ascending: true })
  return q
}

async function runReadView(client: DataClient, input: unknown, opts?: AgentToolsOptions): Promise<unknown> {
  const {
    view: viewName, columns, filters, date_from: dateFrom, date_to: dateTo, order, order_by: orderBy, offset, limit,
    ...rest
  } = (input ?? {}) as Row
  const unknownKeys = Object.keys(rest)
  if (unknownKeys.length > 0) throw new ToolInputError(`unknown input keys: ${unknownKeys.join(', ')}`)
  const { view, dateCol, allow, guard } = resolveView(viewName, opts)

  if ((dateFrom !== undefined || dateTo !== undefined) && !dateCol) throw new ToolInputError(`${view} has no date column for range/order`)
  if (order !== undefined && orderBy === undefined && !dateCol) throw new ToolInputError(`${view} has no date column for range/order`)
  if (columns !== undefined && !Array.isArray(columns)) throw new ToolInputError('columns must be an array')
  const cols = ((columns ?? []) as unknown[]).map(guard)
  const parsed = parseFilters(filters, guard)
  // A range is a filter: on a hidden date column it would answer questions about hidden values.
  if (dateFrom !== undefined || dateTo !== undefined) guard(dateCol)
  if (order !== undefined && order !== 'asc' && order !== 'desc') throw new ToolInputError(`bad order: ${String(order)}`)
  // Sorting by a hidden column leaks its ranking. The default date-column sort is skipped instead
  // when the date column is hidden; asking for it explicitly is denied.
  let sortCol: string | undefined
  if (orderBy !== undefined) sortCol = guard(orderBy)
  else if (dateCol) {
    if (order !== undefined) guard(dateCol)
    if (!allow || allow.includes(dateCol)) sortCol = dateCol
  }
  const rowLimit = limit === undefined ? 50 : limit
  if (typeof rowLimit !== 'number' || !Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 200) {
    throw new ToolInputError(`bad limit: ${String(limit)}`)
  }
  if (offset !== undefined) {
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) throw new ToolInputError(`bad offset: ${String(offset)}`)
    if (!sortCol) throw new ToolInputError('offset needs order_by or a visible date column')
  }

  // Select only what was asked for (plus the date column, if needed for order/range but not
  // itself requested) instead of `select('*')` + client-side trimming.
  let selectCols = '*'
  // `columns: []` under an allowlist means "none named": an empty select= makes PostgREST fall
  // back to `*`, which would expose every hidden column.
  if (columns !== undefined && !(allow && cols.length === 0)) {
    const needed = new Set<string>(cols)
    const dateUsed = dateFrom !== undefined || dateTo !== undefined || (order !== undefined && orderBy === undefined)
    if (dateCol && (!allow || allow.includes(dateCol)) && dateUsed) needed.add(dateCol)
    selectCols = [...needed].join(',')
  } else if (allow) {
    selectCols = allow.join(',')
  }

  let q = viewQuery(client, view, selectCols)
  for (const f of parsed) q = applyFilter(q, f)
  q = applyRange(q, dateCol, dateFrom, dateTo)
  q = applyOrder(q, view, sortCol, order === 'asc')
  q = offset !== undefined ? q.range(offset, offset + rowLimit - 1) : q.limit(rowLimit)

  const { data, error } = await q
  if (error) throw new DataClientError(error)
  const rows = data ?? []
  return { rows, count: rows.length, truncated: rows.length === rowLimit }
}

/** Every row matching `apply`, in key order, one PostgREST page at a time, up to SCAN_ROW_CAP.
 *  `partial` is true only when a matching row exists past the cap (one extra row is probed). */
async function scanRows(
  client: DataClient, view: ViewName, selectCols: string, apply: (q: ViewQuery) => ViewQuery,
): Promise<{ rows: Row[]; partial: boolean }> {
  const page = async (from: number, n: number): Promise<Row[]> => {
    const { data, error } = await applyOrder(apply(viewQuery(client, view, selectCols)), view, undefined, true).range(from, from + n - 1)
    if (error) throw new DataClientError(error)
    return data ?? []
  }
  const rows: Row[] = []
  // ponytail: ends on an empty page, not a short one (the server's max_rows may be below PAGE_SIZE), so
  // every scan costs one extra empty request — upgrade to a Content-Range count if that matters.
  while (rows.length < SCAN_ROW_CAP) {
    const got = await page(rows.length, Math.min(PAGE_SIZE, SCAN_ROW_CAP - rows.length))
    if (got.length === 0) return { rows, partial: false }
    rows.push(...got)
  }
  return { rows, partial: (await page(rows.length, 1)).length > 0 }
}

/** UTC bucket label for a date/timestamp value: YYYY-MM-DD, YYYY-MM or YYYY. */
function periodBucket(value: unknown, period: Period): string | null {
  if (value === null || value === undefined) return null
  const t = typeof value === 'string' ? new Date(value).getTime() : NaN
  if (Number.isNaN(t)) throw new ToolInputError('date column held a non-date value')
  return new Date(t).toISOString().slice(0, { day: 10, month: 7, year: 4 }[period])
}

function compareKeys(a: unknown[], b: unknown[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    if (a[i] === null) return -1
    if (b[i] === null) return 1
    return (a[i] as string | number) < (b[i] as string | number) ? -1 : 1
  }
  return 0
}

/** Columns whose values are too large (text or json/array) to group by or aggregate for up to SCAN_ROW_CAP rows in memory. */
const LARGE_COLUMNS = new Set(['body', 'attributes', 'participants', 'tags', 'last_error'])

/** Columns a non-count metric on `column` must also be split by, so unlike values are never added:
 *  money in minor units is one currency per row; daily_metrics_v1.value holds sessions, spend, clicks...
 *  one `metric` per row, with spend in minor units of `currency`. */
function splitColumnsFor(view: ViewName, column: string): string[] {
  if (view === 'daily_metrics_v1' && column === 'value') return ['metric', 'currency']
  if (!column.endsWith('_minor')) return []
  return [view === 'daily_summary_v1' && column.startsWith('ad_') ? 'ad_currency' : 'currency']
}

async function runSummarizeView(client: DataClient, input: unknown, opts?: AgentToolsOptions): Promise<unknown> {
  const {
    view: viewName, metric, column, group_by: groupBy, period, filters, date_from: dateFrom, date_to: dateTo, order, limit,
    ...rest
  } = (input ?? {}) as Row
  const unknownKeys = Object.keys(rest)
  if (unknownKeys.length > 0) throw new ToolInputError(`unknown input keys: ${unknownKeys.join(', ')}`)
  const { view, dateCol, allow, guard } = resolveView(viewName, opts)

  if (typeof metric !== 'string' || !(METRICS as readonly string[]).includes(metric)) throw new ToolInputError(`bad metric: ${String(metric)}`)
  const agg = metric as Metric
  if (column === undefined && agg !== 'count') throw new ToolInputError(`${agg} needs a column`)
  const metricCol = column === undefined ? undefined : guard(column)
  if (groupBy !== undefined && (!Array.isArray(groupBy) || groupBy.length > MAX_GROUP_BY)) {
    throw new ToolInputError(`group_by must be an array of at most ${MAX_GROUP_BY} columns`)
  }
  const groupCols = ((groupBy ?? []) as unknown[]).map(guard)
  for (const c of [...(metricCol ? [metricCol] : []), ...groupCols]) {
    if (LARGE_COLUMNS.has(c)) throw new ToolInputError(`${c} is too large to group by or aggregate`)
  }
  // The result row has fixed `period` and `value` keys; a grouped column of that name would be overwritten.
  for (const c of groupCols) if (c === 'value' || c === 'period') throw new ToolInputError(`cannot group by a column named ${c}`)
  if (period !== undefined && (typeof period !== 'string' || !(PERIODS as readonly string[]).includes(period))) {
    throw new ToolInputError(`bad period: ${String(period)}`)
  }
  const bucket = period as Period | undefined
  const parsed = parseFilters(filters, guard)
  const ranged = dateFrom !== undefined || dateTo !== undefined
  if ((bucket || ranged) && !dateCol) throw new ToolInputError(`${view} has no date column for period/range`)
  // A bucket or a range reads the date column, so a hidden one is denied like any other column.
  if (bucket || ranged) guard(dateCol)
  if (order !== undefined && !(SUMMARY_ORDERS as readonly string[]).includes(order as string)) throw new ToolInputError(`bad order: ${String(order)}`)
  const rowLimit = limit === undefined ? 50 : limit
  if (typeof rowLimit !== 'number' || !Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 200) {
    throw new ToolInputError(`bad limit: ${String(limit)}`)
  }

  // Dimensions of the answer, in output order: period, group_by, then the auto currency split.
  const dims: string[] = [...(bucket ? ['period'] : []), ...groupCols]
  const sourceCols = [...groupCols]
  if (agg !== 'count' && metricCol) {
    const pinned = parsed.filter((f) => f.op === 'eq').map((f) => f.column)
    for (const c of splitColumnsFor(view, metricCol)) {
      if (groupCols.includes(c) || pinned.includes(c) || (allow && !allow.includes(c))) continue
      dims.push(c)
      sourceCols.push(c)
    }
  }
  // An empty select= means `*` to PostgREST, so a bare count still names one (key) column.
  const need = new Set<string>([...(metricCol ? [metricCol] : []), ...sourceCols, ...(bucket && dateCol ? [dateCol] : [])])
  const selectCols = need.size > 0 ? [...need].join(',') : VIEW_KEY[view][0]

  const { rows, partial } = await scanRows(client, view, selectCols, (q) => {
    for (const f of parsed) q = applyFilter(q, f)
    return applyRange(q, dateCol, dateFrom, dateTo)
  })

  const groups = new Map<string, { key: unknown[]; n: number; sum: number; min: number; max: number }>()
  for (const row of rows) {
    let v: number | undefined
    if (metricCol !== undefined) {
      const raw = row[metricCol]
      if (raw === null || raw === undefined) continue // nulls are skipped, as in SQL
      if (agg !== 'count') {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new ToolInputError(`${metricCol} is not numeric`)
        v = raw
      }
    }
    const key = [...(bucket ? [periodBucket(row[dateCol as string], bucket)] : []), ...sourceCols.map((c) => row[c] ?? null)]
    const id = JSON.stringify(key)
    let g = groups.get(id)
    if (!g) groups.set(id, (g = { key, n: 0, sum: 0, min: Infinity, max: -Infinity }))
    g.n++
    if (v !== undefined) {
      g.sum += v
      g.min = Math.min(g.min, v)
      g.max = Math.max(g.max, v)
    }
  }

  const valueOf = (g: { n: number; sum: number; min: number; max: number }): number =>
    ({ count: g.n, sum: g.sum, avg: g.n ? g.sum / g.n : 0, min: g.min, max: g.max })[agg]
  const all = [...groups.values()].map((g) => ({ key: g.key, value: valueOf(g) }))
  const sortMode = order ?? 'value_desc'
  all.sort((a, b) => (sortMode === 'key' ? 0 : sortMode === 'value_asc' ? a.value - b.value : b.value - a.value) || compareKeys(a.key, b.key))
  const out = all.slice(0, rowLimit).map(({ key, value }) => ({ ...Object.fromEntries(dims.map((d, i) => [d, key[i]])), value }))
  return {
    rows: out,
    count: out.length,
    truncated: all.length > rowLimit,
    scanned_rows: rows.length,
    partial,
    ...(partial ? { note: `totals cover only the first ${SCAN_ROW_CAP} rows; narrow the date range` } : {}),
  }
}

/** Runs one agent tool call. `opts` must match what produced `name` via `agentTools` — an
 *  unexposed view/RPC for these opts is rejected the same as an unknown one. Model output is
 *  untrusted: every input is validated at this boundary before it reaches the database. */
export async function runTool(client: DataClient, name: string, input: unknown, opts?: AgentToolsOptions): Promise<unknown> {
  const exposed = new Set(agentTools(opts).map((t) => t.name))
  if (!exposed.has(name)) throw new ToolInputError(`unknown or unexposed tool: ${name}`)

  if (name === 'read_view') return runReadView(client, input, opts)
  if (name === 'summarize_view') return runSummarizeView(client, input, opts)

  const rpcName = name as AgentRpcName
  const schema = RPC_TOOL_SCHEMAS[rpcName]
  const body = (input ?? {}) as Record<string, unknown>
  const unknownKeys = Object.keys(body).filter((k) => !(k in schema.properties))
  if (unknownKeys.length > 0) throw new ToolInputError(`unknown input keys: ${unknownKeys.join(', ')}`)
  for (const req of schema.required ?? []) {
    if (!(req in body)) throw new ToolInputError(`missing required field: ${req}`)
  }
  for (const [field, value] of Object.entries(body)) {
    checkRpcField(field, value, schema.properties[field] as RpcFieldSchema)
  }
  return (client.rpc as any)[rpcName](body)
}
