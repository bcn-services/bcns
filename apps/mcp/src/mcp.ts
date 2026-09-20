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
  type DataClient,
} from '@bcn-services/data-client'

export const SERVER_INFO = { name: 'bcns', version: '0.1.0' } as const

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** agentTools()'s `input_schema` is already JSON Schema; only the key name differs. */
export function mcpTools(): McpTool[] {
  return agentTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema as unknown as Record<string, unknown>,
  }))
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

export function buildServer(client: DataClient): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools() }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await runTool(client, request.params.name, request.params.arguments ?? {})
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
    } catch (err) {
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
