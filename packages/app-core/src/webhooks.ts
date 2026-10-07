/**
 * webhooks.ts — Generic inbound-webhook hygiene helpers.
 *
 * Platform rules (hosting reference): every inbound webhook verifies its
 * signature (anyone can POST to a public URL) and every handler is idempotent
 * (senders retry; processing the same event twice must change state once).
 *
 * There are deliberately NO provider-specific routes in the template — which
 * processor/SMS/accounting webhooks a client needs is a per-client decision.
 * Client builds wire a provider's real verifier (e.g. Twilio's request
 * validation) into these seams. Stripe's is below (`stripeVerifier`), on
 * node:crypto alone so no SDK is needed.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies a raw request body + signature header for one provider. */
export interface SignatureVerifier {
  verify(rawBody: string, signatureHeader: string | null): boolean;
}

/**
 * FAIL-CLOSED placeholder verifier: rejects everything. A route wired with
 * this compiles and deploys but refuses all traffic until a real provider
 * verifier replaces it — a cloned template can never silently trust
 * unauthenticated input.
 */
export const unverifiedVerifier: SignatureVerifier = {
  verify: () => false,
};

/** Persistence seam for processed-event ids (a Postgres table in real builds). */
export interface ProcessedEventStore {
  /** Record the id; return true if it was NEW, false if already processed. */
  markProcessed(eventId: string): Promise<boolean>;
}

/** In-memory store — dev/test only; real builds back this with Postgres. */
export function createMemoryEventStore(): ProcessedEventStore {
  const seen = new Set<string>();
  return {
    async markProcessed(eventId: string): Promise<boolean> {
      if (seen.has(eventId)) return false;
      seen.add(eventId);
      return true;
    },
  };
}

export type WebhookOutcome<T> =
  | { status: "rejected"; reason: "bad-signature" }
  | { status: "duplicate"; eventId: string }
  | { status: "processed"; eventId: string; result: T };

/**
 * Run a webhook event through the full hygiene pipeline: verify signature,
 * drop duplicates, then hand off to the handler exactly once per event id.
 */
export async function processWebhook<T>(
  input: { rawBody: string; signatureHeader: string | null; eventId: string },
  deps: {
    verifier: SignatureVerifier;
    store: ProcessedEventStore;
    handler: (rawBody: string) => Promise<T>;
  },
): Promise<WebhookOutcome<T>> {
  if (!deps.verifier.verify(input.rawBody, input.signatureHeader)) {
    return { status: "rejected", reason: "bad-signature" };
  }
  const isNew = await deps.store.markProcessed(input.eventId);
  if (!isNew) {
    return { status: "duplicate", eventId: input.eventId };
  }
  const result = await deps.handler(input.rawBody);
  return { status: "processed", eventId: input.eventId, result };
}

/** Stripe's own default: a signed timestamp older (or newer) than this is a replay. */
export const STRIPE_TOLERANCE_SEC = 300;

/**
 * Verify a `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=...]`) over the
 * raw body: HMAC-SHA256 of `${t}.${rawBody}` keyed with the endpoint's
 * `whsec_...` signing secret, any v1 may match, compared in constant time, and
 * `t` must sit within `toleranceSec` of `now` (unix seconds). Fails closed on an
 * empty secret, a missing header, or anything malformed.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  opts: { now?: number; toleranceSec?: number } = {},
): boolean {
  if (!secret || !header || header.length > 2048) return false;
  let t: number | null = null;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") t = /^\d{1,12}$/.test(value) ? Number(value) : null;
    else if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) candidates.push(value);
  }
  if (t === null || candidates.length === 0) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSec ?? STRIPE_TOLERANCE_SEC)) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest();
  return candidates.some((hex) => timingSafeEqual(Buffer.from(hex, "hex"), expected));
}

/** `verifyStripeSignature` as the SignatureVerifier `processWebhook` takes. `now` is injectable for tests. */
export function stripeVerifier(secret: string, opts: { now?: () => number; toleranceSec?: number } = {}): SignatureVerifier {
  return {
    verify: (rawBody, header) =>
      verifyStripeSignature(rawBody, header, secret, { now: opts.now?.(), toleranceSec: opts.toleranceSec }),
  };
}
