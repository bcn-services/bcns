/**
 * webhooks.ts — Generic inbound-webhook hygiene helpers.
 *
 * Platform rules (hosting reference): every inbound webhook verifies its
 * signature (anyone can POST to a public URL) and every handler is idempotent
 * (senders retry; processing the same event twice must change state once).
 *
 * There are deliberately NO provider-specific routes in the template — which
 * processor/SMS/accounting webhooks a client needs is a per-client decision.
 * Client builds wire a provider's real verifier (e.g. Stripe's
 * `webhooks.constructEvent`, Twilio's request validation) into these seams.
 */

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
