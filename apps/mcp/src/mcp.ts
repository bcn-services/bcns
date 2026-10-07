// The adapter: packages/data-client's agentTools()/runTool() projected onto MCP.
// One Server + one transport per request, stateless — no Mcp-Session-Id, so any number of
// processes can serve the endpoint.
//
// The low-level `Server` rather than `McpServer`: agentTools() returns plain JSON Schema, and
// McpServer.registerTool only accepts a Zod shape. Passing the schema straight through is the
// whole point of this file, so the low-level tools/list + tools/call handlers are the fit.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import {
  agentTools,
  runTool,
  DataClientError,
  ToolInputError,
  type AgentToolAnnotations,
  type AgentToolsOptions,
  type DataClient,
} from '@bcn-services/data-client'
import {
  CONTACT_DESCRIPTION,
  CUSTOMER_CONTACT_COLUMN,
  MCP_COLUMNS,
  MCP_TOOL_OPTIONS,
  MCP_VIEWS,
  RESULT_BYTE_CAP,
  TOOL_ANNOTATIONS,
  TOOL_TITLES,
  UNTRUSTED_DESCRIPTION,
  UNTRUSTED_NOTE,
} from './policy.js'

export const SERVER_INFO = { name: 'bcns', version: '0.1.0' } as const

export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: AgentToolAnnotations & { title: string }
}

/** agentTools()'s `input_schema` is already JSON Schema; only the key name differs. */
export function mcpTools(): McpTool[] {
  return agentTools(MCP_TOOL_OPTIONS).map((tool) => {
    // No fallback to the machine name: a tool added without a human title must fail loudly, not ship.
    const title = TOOL_TITLES[tool.name]
    if (!title || title === tool.name) throw new Error(`tool "${tool.name}" has no human title in TOOL_TITLES`)
    return {
      name: tool.name,
      title,
      description: `${tool.description}\n${UNTRUSTED_DESCRIPTION}\n${CONTACT_DESCRIPTION}`,
      inputSchema: tool.input_schema as unknown as Record<string, unknown>,
      annotations: { title, ...TOOL_ANNOTATIONS },
    }
  })
}

/** What a tool call returns to the model: the rows marked as untrusted, capped at `cap` bytes of
 *  serialized JSON by dropping trailing rows. Binary search, so a 200-row result is ~8 stringifies.
 *  ponytail: a single row over the cap yields zero rows (truncated) — add per-field clipping if a
 *  real tenant's one meeting transcript exceeds 256 KB. */
export function envelope(result: unknown, cap = RESULT_BYTE_CAP): string {
  return envelopeParts(result, cap).text
}

/** envelope() plus how many rows survived the cap, for the audit row. A summarize_view result also
 *  carries scanned_rows / partial (and a note when partial); they pass through untouched. */
function envelopeParts(result: unknown, cap = RESULT_BYTE_CAP): { text: string; count: number } {
  const { rows, truncated, scanned_rows, partial, note } = result as {
    rows: unknown[]
    truncated: boolean
    scanned_rows?: number
    partial?: boolean
    note?: string
  }
  const build = (n: number) =>
    JSON.stringify({
      untrusted_data: true,
      note: note ? `${UNTRUSTED_NOTE} ${note}` : UNTRUSTED_NOTE,
      rows: rows.slice(0, n),
      count: n,
      truncated: truncated || n < rows.length,
      ...(scanned_rows === undefined ? {} : { scanned_rows, partial }),
    })
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (Buffer.byteLength(build(mid)) <= cap) lo = mid
    else hi = mid - 1
  }
  return { text: build(lo), count: lo }
}

// A type alias, not an interface: the SDK's ServerResult union has an index signature,
// and only an alias picks up the implicit one that makes it assignable.
export type ToolErrorResult = {
  content: { type: 'text'; text: string }[]
  isError: true
}

/** Only the data-client's own vocabulary reaches the caller: a ToolInputError, or a
 *  DataClientError whose sqlstate it deliberately maps. `code === 'unknown'` means the message
 *  is raw PostgREST/Postgres text — `42703 column "x" does not exist` is a schema-enumeration
 *  oracle, and `fetch failed` is upstream detail — so those degrade with everything else. */
export function toolError(err: unknown): ToolErrorResult {
  const known =
    err instanceof ToolInputError || (err instanceof DataClientError && err.code !== 'unknown')
  const text = known ? (err as Error).message : 'tool call failed'
  return { content: [{ type: 'text', text }], isError: true }
}

/** Short stable code for the audit row: never the message, which can carry raw upstream text. */
export function auditCode(err: unknown): string {
  if (err instanceof ToolInputError) return 'input'
  if (err instanceof DataClientError) return err.code
  return 'internal'
}

/** The view a query-tool call names, or null. Only a string is ever logged. */
function viewOf(args: unknown): string | null {
  // Model input is untyped; only a string survives the check on the next line.
  const view = (args as { view?: unknown } | null)?.view
  return typeof view === 'string' ? view : null
}

/** Audit columns are canonical, never model-controlled free text: a tool outside the listed names
 *  is 'unknown', and a view is logged only for a query tool on an exposed view. */
function auditTool(name: string): string {
  return mcpTools().some((t) => t.name === name) ? name : 'unknown'
}
function auditView(name: string, args: unknown): string | null {
  const view = viewOf(args)
  return (name === 'read_view' || name === 'summarize_view') && view !== null && (MCP_VIEWS as string[]).includes(view) ? view : null
}

/** Fire-and-forget: one api.log_mcp_call as the caller (their own token, no privileged key). A
 *  failure never reaches the tool response; it becomes one stderr JSON line with no token, no
 *  tool arguments and no row data. */
function audit(
  client: DataClient,
  entry: { tool: string; view: string | null; rowCount: number | null; ok: boolean; errorCode: string | null },
): void {
  const fail = (err: unknown) => {
    try {
      console.error(JSON.stringify({ level: 'error', event: 'mcp_audit_failed', code: auditCode(err) }))
    } catch {
      // stderr itself is gone; nothing left to tell.
    }
  }
  void (async () => {
    // Cast: null is meaningful for view/row_count/error_code, but the generated args type has no nulls.
    await client.rpc.log_mcp_call({
      p_tool: entry.tool,
      p_view: entry.view,
      p_row_count: entry.rowCount,
      p_ok: entry.ok,
      p_error_code: entry.errorCode,
    } as unknown as Parameters<DataClient['rpc']['log_mcp_call']>[0])
  })().catch(fail)
}

/** How long a customers_v1 read waits for the owner switch before failing closed. */
export const SETTINGS_TIMEOUT_MS = 2000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/** Tool options for one call. A customers_v1 read, by any tool naming that view, asks the tenant's
 *  owner switch once; only an own, explicit `true` adds `email` to that view's allowlist. A
 *  timeout, an error or an odd shape stays hidden. */
async function optionsFor(client: DataClient, args: unknown, timeoutMs: number): Promise<AgentToolsOptions> {
  if (viewOf(args) !== 'customers_v1') return MCP_TOOL_OPTIONS
  try {
    const settings: unknown = await withTimeout(Promise.resolve(client.rpc.get_ai_settings()), timeoutMs)
    // Cast: narrowed to a non-null object on the left of the &&, then read by own key only.
    const granted =
      typeof settings === 'object' && settings !== null && Object.hasOwn(settings, 'share_customer_contact') &&
      (settings as { share_customer_contact?: unknown }).share_customer_contact === true
    if (!granted) return MCP_TOOL_OPTIONS
  } catch {
    return MCP_TOOL_OPTIONS
  }
  return {
    ...MCP_TOOL_OPTIONS,
    columns: { ...MCP_COLUMNS, customers_v1: [...(MCP_COLUMNS.customers_v1 ?? []), CUSTOMER_CONTACT_COLUMN] },
  }
}

export function buildServer(client: DataClient, opts: { settingsTimeoutMs?: number } = {}): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools() }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params
    const args = request.params.arguments ?? {}
    const tool = auditTool(name)
    const view = auditView(name, args)
    try {
      const result = await runTool(client, name, args, await optionsFor(client, args, opts.settingsTimeoutMs ?? SETTINGS_TIMEOUT_MS))
      const { text, count } = envelopeParts(result)
      audit(client, { tool, view, rowCount: count, ok: true, errorCode: null })
      return { content: [{ type: 'text' as const, text }] }
    } catch (err) {
      audit(client, { tool, view, rowCount: null, ok: false, errorCode: auditCode(err) })
      return toolError(err)
    }
  })

  return server
}

/** Handles one POST /mcp. The server and transport live and die with the request. */
export async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
  client: DataClient,
): Promise<void> {
  const server = buildServer(client)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  // After connect: a close firing mid-connect would tear down a transport that is still wiring up.
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await transport.handleRequest(req, res)
}
