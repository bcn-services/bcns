/**
 * ai.ts — Opt-in AI module.
 *
 * The AI feature is genuinely opt-in: `maybeGetAiClient` checks the AI_ENABLED
 * flag FIRST and returns null before the client factory is ever referenced.
 * `createAnthropicClient` is only reached when the flag is on AND a key is set,
 * so a build/import with the flag off never constructs an Anthropic client.
 *
 * The factory is injected (deps.createClient) purely as a test seam so an
 * import-boundary test can prove non-invocation when the flag is off.
 */

import { createAnthropicClient } from "@bcns/app-core";
import { getConfig, type AppConfig } from "./env";

/**
 * The Anthropic client type, derived from app-core's factory return type so we
 * don't take a direct dependency on @anthropic-ai/sdk here.
 */
type AnthropicClient = ReturnType<typeof createAnthropicClient>;

/** Test seam: swap the underlying client factory. */
export interface AiDeps {
  createClient?: typeof createAnthropicClient;
  config?: AppConfig;
}

/**
 * Return an Anthropic client ONLY when the AI feature is opted in and a key is
 * present; otherwise null. When AI_ENABLED is off this returns before the
 * factory is called, so the client is never constructed.
 */
export function maybeGetAiClient(deps: AiDeps = {}): AnthropicClient | null {
  const config = deps.config ?? getConfig();
  if (!config.aiEnabled) {
    return null;
  }
  if (!config.anthropicApiKey) {
    return null;
  }
  const createClient = deps.createClient ?? createAnthropicClient;
  return createClient({ apiKey: config.anthropicApiKey });
}

/** True when the AI feature flag is on. Cheap predicate for UI gating. */
export function isAiEnabled(deps: AiDeps = {}): boolean {
  const config = deps.config ?? getConfig();
  return config.aiEnabled;
}
