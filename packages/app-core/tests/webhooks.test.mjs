/**
 * Tests for the generic webhook hygiene helpers (lib/webhooks.ts).
 * Run with: corepack pnpm --filter @nseluga/app-core test
 *
 * Covers the two platform rules:
 *  - signature verification gates everything (fail-closed default rejects all)
 *  - idempotency: the same event id is handled exactly once
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  processWebhook,
  unverifiedVerifier,
  createMemoryEventStore,
} from "../src/webhooks.ts";

const passVerifier = { verify: () => true };

test("webhooks: fail-closed default verifier rejects, handler never runs", async () => {
  let handled = 0;
  const outcome = await processWebhook(
    { rawBody: "{}", signatureHeader: "sig", eventId: "evt_1" },
    {
      verifier: unverifiedVerifier,
      store: createMemoryEventStore(),
      handler: async () => {
        handled += 1;
      },
    },
  );
  assert.deepEqual(outcome, { status: "rejected", reason: "bad-signature" });
  assert.equal(handled, 0, "rejected events must never reach the handler");
});

test("webhooks: duplicate event id is processed exactly once", async () => {
  const store = createMemoryEventStore();
  let handled = 0;
  const input = { rawBody: '{"n":1}', signatureHeader: "sig", eventId: "evt_dup" };
  const deps = {
    verifier: passVerifier,
    store,
    handler: async (raw) => {
      handled += 1;
      return JSON.parse(raw).n;
    },
  };

  const first = await processWebhook(input, deps);
  const second = await processWebhook(input, deps);

  assert.deepEqual(first, { status: "processed", eventId: "evt_dup", result: 1 });
  assert.deepEqual(second, { status: "duplicate", eventId: "evt_dup" });
  assert.equal(handled, 1, "retries must change state once");
});

test("webhooks: distinct event ids are each handled", async () => {
  const store = createMemoryEventStore();
  const deps = { verifier: passVerifier, store, handler: async () => "ok" };
  const a = await processWebhook(
    { rawBody: "{}", signatureHeader: "s", eventId: "evt_a" },
    deps,
  );
  const b = await processWebhook(
    { rawBody: "{}", signatureHeader: "s", eventId: "evt_b" },
    deps,
  );
  assert.equal(a.status, "processed");
  assert.equal(b.status, "processed");
});
