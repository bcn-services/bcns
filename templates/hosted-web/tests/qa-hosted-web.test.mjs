/**
 * QA value-add tests for the hosted-web template (A2).
 * Complements the engineer's ai-optin/webhook suites. Run with:
 *   corepack pnpm --filter @nseluga/hosted-web-template test
 *
 * Covers:
 *  - webhook handler: active -> provision, canceled -> suspend (through app-core)
 *  - env module: safe defaults when NO keys are set (never throws, all undefined)
 *  - AI opt-in control case: flag ON + key present DOES invoke the injected factory
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleStripeEvent } from "../lib/webhook.ts";
import { getConfig } from "../lib/env.ts";
import { maybeGetAiClient } from "../lib/ai.ts";

function evt(status, type = "customer.subscription.updated") {
  return { type, status, customerId: "cus_qa", subscriptionId: "sub_qa" };
}

test("webhook: active -> provision through the handler", () => {
  const r = handleStripeEvent(evt("active"));
  assert.equal(r.decision, "provision");
  assert.equal(r.customerId, "cus_qa");
  assert.equal(r.subscriptionId, "sub_qa");
});

test("webhook: canceled -> suspend through the handler", () => {
  const r = handleStripeEvent(evt("canceled", "customer.subscription.deleted"));
  assert.equal(r.decision, "suspend");
});

test("env: getConfig returns safe defaults when no keys are set (no throw)", () => {
  // Snapshot and clear every env var the config reads, then restore.
  const keys = [
    "DATABASE_URL",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
    "AI_ENABLED",
  ];
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    let cfg;
    assert.doesNotThrow(() => {
      cfg = getConfig();
    }, "getConfig must not throw when no env vars are set");
    assert.equal(cfg.databaseUrl, undefined);
    assert.equal(cfg.clerkPublishableKey, undefined);
    assert.equal(cfg.clerkSecretKey, undefined);
    assert.equal(cfg.stripeSecretKey, undefined);
    assert.equal(cfg.stripeWebhookSecret, undefined);
    assert.equal(cfg.anthropicApiKey, undefined);
    assert.equal(cfg.aiEnabled, false, "AI defaults OFF when AI_ENABLED unset");
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test("env: empty/whitespace values are treated as unset", () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "   ";
  try {
    assert.equal(getConfig().stripeSecretKey, undefined, "whitespace-only -> undefined");
  } finally {
    if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = saved;
  }
});

test("AI control case: flag ON + key present invokes the injected factory once", () => {
  const calls = [];
  const createClient = (cfg) => {
    calls.push(cfg);
    return { __qaMock: true };
  };
  const config = { aiEnabled: true, anthropicApiKey: "sk-ant-qa-fake" };
  const client = maybeGetAiClient({ createClient, config });
  assert.equal(calls.length, 1, "opt-in path must invoke the injected factory");
  assert.equal(calls[0].apiKey, "sk-ant-qa-fake", "factory receives the configured key");
  assert.deepEqual(client, { __qaMock: true });
});
