/**
 * agent/index.ts — CLI agent over the shared-platform data client.
 *
 * A minimal Anthropic Messages tool loop: the model calls `read_view` (and any
 * opted-in RPC tools) via `agentTools`/`runTool` from @bcn-services/data-client.
 * `AnthropicLike` is a structural subset of the Anthropic SDK's client (the shape
 * `createAnthropicClient` from @bcn-services/app-core returns) so this module
 * never imports @anthropic-ai/sdk directly.
 */

import { agentTools, runTool, signIn, type AgentTool, type AgentToolsOptions, type DataClient } from "@bcn-services/data-client";
import { getConfig } from "../lib/env";
import { maybeGetAiClient } from "../lib/ai";

/** One content block of an Anthropic message — only the fields this loop reads/writes. */
export interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string | null;
}

/** Structural subset of the Anthropic SDK client that `createAnthropicClient` returns. */
export interface AnthropicLike {
  defaultModel: string;
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: AnthropicMessageParam[];
      tools: AgentTool[];
    }): Promise<AnthropicResponse>;
  };
}

export interface RunAgentDeps {
  ai: AnthropicLike;
  data: DataClient;
  tools?: AgentToolsOptions;
  maxTurns?: number;
}

const MAX_TOKENS = 4096;

/**
 * Runs the Messages tool loop until the model stops calling tools (a non-
 * `tool_use` stop_reason) and returns the final text; throws if `maxTurns`
 * runs out first. Every `tool_use` block is executed via `runTool`; a thrown error
 * (bad input, platform error) comes back to the model as an `is_error`
 * tool_result rather than aborting the loop.
 */
export async function runAgent(prompt: string, deps: RunAgentDeps): Promise<string> {
  const { ai, data, tools, maxTurns = 10 } = deps;
  const toolDefs = agentTools(tools);
  const messages: AnthropicMessageParam[] = [{ role: "user", content: prompt }];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await ai.messages.create({
      model: ai.defaultModel,
      max_tokens: MAX_TOKENS,
      messages,
      tools: toolDefs,
    });

    if (response.stop_reason !== "tool_use") {
      return response.content.find((b) => b.type === "text")?.text ?? "";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: AnthropicContentBlock[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let content: string;
      let is_error = false;
      try {
        content = JSON.stringify(await runTool(data, block.name ?? "", block.input, tools));
      } catch (err) {
        is_error = true;
        content = err instanceof Error ? err.message : String(err);
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content, is_error });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`agent: stopped after ${maxTurns} turns without a final answer`);
}

async function main(): Promise<void> {
  const config = getConfig();
  const ai = maybeGetAiClient({ config });
  if (!ai) {
    console.error("AI is off: set AI_ENABLED=1 and ANTHROPIC_API_KEY");
    process.exit(1);
  }
  if (config.dataSource !== "shared") {
    console.error("agent: DATA_SOURCE must be 'shared'");
    process.exit(1);
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.agentEmail || !config.agentPassword) {
    console.error("agent: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, AGENT_EMAIL and AGENT_PASSWORD are required");
    process.exit(1);
  }
  const prompt = process.argv.slice(2).join(" ");
  if (!prompt) {
    console.error("usage: pnpm agent <prompt>");
    process.exit(1);
  }

  const data = await signIn({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    email: config.agentEmail,
    password: config.agentPassword,
  });

  // maybeGetAiClient's declared return type doesn't carry `defaultModel` (it's
  // attached at runtime via Object.defineProperty in app-core) — narrow here.
  console.log(await runAgent(prompt, { ai: ai as unknown as AnthropicLike, data }));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
