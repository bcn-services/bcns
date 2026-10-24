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
import { SIGNUP_REDIRECT } from "../signup/handler.ts";
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
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Metadata keys apps/connect/lib/stripe-billing.ts puts on a pay-first Checkout session. */
const SIGNUP_NAME_KEY = "signup_name";
const SIGNUP_EMAIL_KEY = "signup_email";
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

export interface SignupWorkspaceInput {
  eventId: string;
  eventType: string;
  /** Unix seconds. */
  eventCreated: number;
  userId: string;
  name: string;
  customerId: string;
  subscriptionId: string | null;
}

/** Pay-first sign-up (checkout.session.completed with signup metadata and no client ref). */
export interface SignupWorkspaceDeps {
  /** userId null = not created (most often: a prior attempt already made it). */
  createUser(email: string): Promise<{ userId: string | null; error?: string }>;
  findUserId(email: string): Promise<string | null>;
  /** api.stripe_signup_workspace. */
  createWorkspace(input: SignupWorkspaceInput): Promise<"created" | "duplicate" | "has_workspace">;
  sendConfirmation(email: string, redirectTo: string): Promise<{ error?: string }>;
  /** api.stripe_signup_alert: tells bcns a paid sign-up needs hand-fixing. Deduped per customer + reason. */
  alert(customerId: string, eventId: string, reason: "create_failed" | "mail_failed"): Promise<void>;
}

export interface StripeWebhookDeps {
  /** Unix seconds; the signature's timestamp tolerance is measured against it. */
  now(): number;
  /** api.stripe_billing_state: the row as JSON, or null when no client matches. */
  readState(clientId: string | null, customerId: string | null): Promise<unknown>;
  /** api.stripe_apply_billing. */
  apply(input: ApplyInput): Promise<"applied" | "duplicate" | "conflict">;
  /** Pay-first sign-up wiring. Absent = a signup session is answered 503 (Stripe retries) rather than dropped. */
  signup?: SignupWorkspaceDeps;
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

/** A Stripe id field is a string, or an expanded object carrying `id`. */
const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

/**
 * The pay-first session in `event`, or null. Subscription mode, settled (paid, or nothing due
 * because a promo code covered it), no client reference, signup metadata present.
 */
function signupSession(event: StripeEvent): { customerId: string | null; subscriptionId: string | null } | null {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return null;
  if (typeof event.created !== "number" || !Number.isFinite(event.created)) return null;
  const o = event.data?.object as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object" || o.mode !== "subscription") return null;
  if (o.payment_status !== "paid" && o.payment_status !== "no_payment_required") return null;
  if (typeof o.client_reference_id === "string" && o.client_reference_id) return null;
  const meta = o.metadata;
  if (!meta || typeof meta !== "object" || typeof (meta as Record<string, unknown>)[SIGNUP_EMAIL_KEY] !== "string") return null;
  const customer = idOf(o.customer);
  const subscription = idOf(o.subscription);
  return {
    customerId: customer && CUSTOMER_ID.test(customer) ? customer : null,
    subscriptionId: subscription && SUBSCRIPTION_ID.test(subscription) ? subscription : null,
  };
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

  // Pay-first sign-up: a completed subscription session that names no client but carries the signup
  // metadata. Routed before billingSignal and readState: billingSignal reads only
  // payment_status "paid", but a 100%-off / free-first-period promo code completes with
  // "no_payment_required" and is still a live subscription that needs its workspace; readState
  // would answer unknown_client. Any other payment_status (e.g. "unpaid") creates nothing.
  const session = signupSession(event);
  if (session) return handleSignup(event, event.created, session.customerId, session.subscriptionId, deps, base);

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

/** An alert failure is logged and never changes the webhook's answer. */
async function tellBcns(
  signup: SignupWorkspaceDeps,
  customerId: string,
  eventId: string,
  reason: "create_failed" | "mail_failed",
  deps: StripeWebhookDeps,
  base: { eventId: string; type: string },
): Promise<void> {
  try {
    await signup.alert(customerId, eventId, reason);
  } catch {
    deps.log("stripe_signup_alert_failed", { ...base, reason });
  }
}

/**
 * One paid pay-first session -> one user, one active client, one owner membership, one mail.
 * Retry-safe at every step: a user left by a prior attempt is found and reused, the RPC is
 * idempotent on the Stripe customer, and the mail goes out only when this call created the
 * workspace. A failure before the RPC commits is 503 (Stripe retries); once it has committed,
 * a mail failure is logged and answered 200, because a retry could not tell it from a replay.
 */
async function handleSignup(
  event: StripeEvent,
  at: number,
  customerId: string | null,
  subscriptionId: string | null,
  deps: StripeWebhookDeps,
  base: { eventId: string; type: string },
): Promise<Response> {
  const meta = event.data.object.metadata as Record<string, unknown>;
  const email = String(meta[SIGNUP_EMAIL_KEY]).trim().toLowerCase();
  const rawName = meta[SIGNUP_NAME_KEY];
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!customerId || !name || name.length > 100 || email.length > 254 || !EMAIL.test(email)) {
    deps.log("stripe_webhook_ignored", { ...base, reason: "bad_signup_session" });
    return json({ ok: true }, 200);
  }
  const signup = deps.signup;
  if (!signup) {
    deps.log("stripe_webhook_rejected", { ...base, reason: "signup_unwired" });
    return json({ error: "retry" }, 503);
  }

  let result: "created" | "duplicate" | "has_workspace";
  try {
    const created = await signup.createUser(email);
    const userId = created.userId ?? (await signup.findUserId(email));
    if (!userId) throw new Error("no user");
    result = await signup.createWorkspace({
      eventId: event.id, eventType: event.type, eventCreated: at, userId, name, customerId, subscriptionId,
    });
  } catch {
    deps.log("stripe_signup_failed", base);
    await tellBcns(signup, customerId, event.id, "create_failed", deps, base);
    return json({ error: "retry" }, 503);
  }

  if (result === "created") {
    try {
      const sent = await signup.sendConfirmation(email, SIGNUP_REDIRECT);
      if (sent.error) throw new Error("mail");
    } catch {
      deps.log("stripe_signup_mail_failed", base);
      await tellBcns(signup, customerId, event.id, "mail_failed", deps, base);
    }
  }
  deps.log("stripe_signup_applied", { ...base, outcome: result });
  return json({ ok: true }, 200);
}
