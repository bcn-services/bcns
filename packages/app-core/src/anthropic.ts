/**
 * anthropic.ts — Bring-your-own-key Anthropic client factory.
 *
 * The client constructor is injected (deps.ClientCtor) so tests can supply a
 * mock without hitting the network. This module never reads process.env — the
 * API key must be passed in explicitly by the caller.
 */

import Anthropic from "@anthropic-ai/sdk";

/**
 * Current cheap default model. Kept as an exact string constant so a model
 * migration is a one-line change here.
 */
export const DEFAULT_MODEL = "claude-haiku-4-5";

/** Thrown when a BYOK config is missing a usable API key. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("An Anthropic API key is required but none was provided.");
    this.name = "MissingApiKeyError";
  }
}

/** Dependency-injection seam so tests can pass a mock client constructor. */
export interface ByokDeps {
  ClientCtor?: typeof Anthropic;
}

export interface ByokConfig {
  apiKey: string;
  model?: string;
}

/**
 * Build an Anthropic client from a bring-your-own-key config. Throws
 * MissingApiKeyError if the key is missing, empty, or whitespace-only. The
 * returned client is tagged with a default model (cfg.model ?? DEFAULT_MODEL)
 * via a non-enumerable property for callers that want a single source of truth.
 */
export function createAnthropicClient(cfg: ByokConfig, deps: ByokDeps = {}): Anthropic {
  const apiKey = cfg.apiKey?.trim();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  const ClientCtor = deps.ClientCtor ?? Anthropic;
  const client = new ClientCtor({ apiKey });
  Object.defineProperty(client, "defaultModel", {
    value: cfg.model ?? DEFAULT_MODEL,
    enumerable: true,
    writable: false,
    configurable: true,
  });
  return client;
}
