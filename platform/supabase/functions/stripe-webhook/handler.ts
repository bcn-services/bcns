/**
 * stripe-webhook — applies a Stripe billing event to one client (item 1). Pure
 * `handle(req, secret, deps)`: every side effect is a dep, so the policy runs on node under vitest
 * without Deno, a database or the service-role key. index.ts is the only Deno file.
 *
 * No caller JWT (deployed with --no-verify-jwt): apps/connect/app/api/webhooks/stripe/route.ts
 * forwards here after its own signature check, but that trust is not extended — this function
 * re-verifies `Stripe-Signature` with its own code (_shared/stripe-signature.ts) against the
 * Supabase-side STRIPE_WEBHOOK_SECRET, and refuses everything when that secret is unset.
 *
 * Decision: app-core's billingSignal + decideBilling (byte-identical copy in _shared/app-core,
 * parity-tested). Write: api.stripe_apply_billing, which repeats every precondition in its
 * UPDATE's WHERE and dedupes on the event id.
 */

import { verifyStripeSignature } from "../_shared/stripe-signature.ts";
import {
  billingSignal,
  decideBilling,
  type BillingState,
  type ClientStatus,
  type StripeEvent,
} from "../_shared/app-core/subscription.ts";

/** Stripe events are a few KB; this bounds what is read before the signature is checked. */
const MAX_BODY_BYTES = 256 * 1024;
const EVENT_ID = /^evt_[A-Za-z0-9]{1,250}$/;
const CUSTOMER_ID = /^cus_[A-Za-z0-9]{1,250}$/;
const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{1,250}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUSES: readonly ClientStatus[] = ["pending", "active", "paused", "churned"];

export interface ApplyInput {
  eventId: string;
  eventType: string;
  /** Unix seconds. */
  eventCreated: number;
  clientId: string;
  /** flag_duplicate: a second live subscription; the RPC keeps the stored one and raises a data.notifications alert. */
  action: "activate" | "resume" | "record_payment" | "start_grace" | "flag_duplicate";
  customerId: string | null;
  subscriptionId: string | null;
  graceUntil: number | null;
}

export interface StripeWebhookDeps {
  /** Unix seconds; the signature's timestamp tolerance is measured against it. */
  now(): number;
  /** api.stripe_billing_state: the row as JSON, or null when no client matches. */
  readState(clientId: string | null, customerId: string | null): Promise<unknown>;
  /** api.stripe_apply_billing. */
  apply(input: ApplyInput): Promise<"applied" | "duplicate" | "conflict">;
  /** Event id, type, client id and outcome ONLY — never the payload, header or secret. */
  log(event: string, data: Record<string, unknown>): void;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** api.stripe_billing_state's JSON -> BillingState. Anything unexpected is null (treated as no client). */
export function parseState(row: unknown): (BillingState & { clientId: string }) | null {
  if (row === null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.client_id !== "string" || !STATUSES.includes(r.status as ClientStatus)) return null;
  return {
    clientId: r.client_id,
    status: r.status as ClientStatus,
    paidAt: numOrNull(r.paid_at),
    graceUntil: numOrNull(r.grace_until),
    subscriptionId: typeof r.subscription_id === "string" ? r.subscription_id : null,
    // Fail toward the exemption: only an explicit false lets billing touch the client.
    shopifyBilled: r.shopify_billed !== false,
    lastEventAt: numOrNull(r.last_event_at),
  };
}

async function readBodyCapped(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function handle(request: Request, secret: string | undefined, deps: StripeWebhookDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secret) {
    deps.log("stripe_webhook_rejected", { reason: "no_secret" });
    return json({ error: "unavailable" }, 503);
  }
  const declared = Number(request.headers.get("Content-Length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  const bytes = await readBodyCapped(request, MAX_BODY_BYTES);
  if (!bytes) return json({ error: "payload_too_large" }, 413);

  if (!(await verifyStripeSignature(bytes, request.headers.get("Stripe-Signature"), secret, deps.now()))) {
    deps.log("stripe_webhook_rejected", { reason: "bad_signature" });
    return json({ error: "unauthorized" }, 401);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(new TextDecoder().decode(bytes)) as StripeEvent;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!event || typeof event.id !== "string" || !EVENT_ID.test(event.id) || typeof event.type !== "string" || event.type.length > 100) {
    return json({ error: "bad_request" }, 400);
  }
  const base = { eventId: event.id, type: event.type };

  const signal = billingSignal(event);
  if (!signal) {
    deps.log("stripe_webhook_ignored", { ...base, reason: "not_billing" });
    return json({ ok: true }, 200);
  }
  const clientRef = signal.clientRef && UUID.test(signal.clientRef) ? signal.clientRef : null;
  const customerId = signal.customerId && CUSTOMER_ID.test(signal.customerId) ? signal.customerId : null;
  const subscriptionId = signal.subscriptionId && SUBSCRIPTION_ID.test(signal.subscriptionId) ? signal.subscriptionId : null;

  const state = parseState(await deps.readState(clientRef, customerId));
  if (!state) {
    deps.log("stripe_webhook_ignored", { ...base, reason: "unknown_client" });
    return json({ ok: true }, 200);
  }

  const decision = decideBilling(state, { ...signal, clientRef, customerId, subscriptionId });
  if (decision.action === "ignore") {
    deps.log("stripe_webhook_ignored", { ...base, clientId: state.clientId, reason: decision.reason });
    return json({ ok: true }, 200);
  }

  const outcome = await deps.apply({
    eventId: event.id,
    eventType: event.type,
    eventCreated: signal.at,
    clientId: state.clientId,
    action: decision.action,
    customerId,
    subscriptionId,
    graceUntil: decision.action === "start_grace" ? decision.graceUntil : null,
  });
  deps.log("stripe_webhook_applied", { ...base, clientId: state.clientId, action: decision.action, outcome });
  // conflict: the row moved between read and write. Nothing changed; Stripe's retry re-decides.
  return outcome === "conflict" ? json({ error: "retry" }, 503) : json({ ok: true }, 200);
}
