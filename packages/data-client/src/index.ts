// @nseluga/data-client — thin typed wrappers over supabase-js for the shared-platform dashboard
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
   *  since §8 says the returned object exposes "nothing else" (no `.auth`). */
  accessToken?: string
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
  return () => client.from(name).select('*')
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
  'download_url',
  'report_dashboard_version',
  'remove_member',
] as const satisfies readonly RpcName[]

type RpcNamespace = {
  [K in (typeof RPC_NAMES)[number]]: (args: Functions[K]['Args']) => Promise<Functions[K]['Returns']>
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

function buildMedia(client: SupabaseClient<Database, 'api'>, rpc: RpcNamespace, accessToken?: string) {
  return {
    /** Storage upload to `<client_id>/orig/<uuid>.<ext>`, then `register_upload`. Returns the media id. */
    async upload(file: File | Blob, opts: MediaUploadOptions = {}): Promise<string> {
      const clientId = decodeClientId(accessToken)
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
  const client = createClient<Database, 'api'>(opts.supabaseUrl, opts.anonKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(opts.accessToken ? { global: { headers: { Authorization: `Bearer ${opts.accessToken}` } } } : {}),
  })

  const rpc = buildRpc(client)

  return {
    views: buildViews(client),
    rpc,
    media: buildMedia(client, rpc, opts.accessToken),
    async health() {
      const { data, error } = await client.from('client_v1').select('*').single()
      if (error) throw new DataClientError(error)
      return data
    },
  }
}
