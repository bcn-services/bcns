/**
 * subscription.ts — Maps Stripe subscription status to an access decision.
 *
 * The status -> decision mapping is an exhaustive switch with NO default: if a
 * new SubStatus is ever added, this file will fail to compile until the new
 * case is handled, rather than silently falling through.
 */

export type SubStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type AccessDecision = "provision" | "suspend";

/**
 * Decide whether an account should have access based on its subscription
 * status. active/trialing keep access; past_due/canceled lose it.
 */
export function decideAccess(status: SubStatus): AccessDecision {
  switch (status) {
    case "active":
    case "trialing":
      return "provision";
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "suspend";
  }
}

export interface StripeSubscriptionEvent {
  type: string;
  status: SubStatus;
  customerId: string;
  subscriptionId: string;
}

/** Convenience wrapper: decide access directly from a Stripe webhook event. */
export function decideFromEvent(e: StripeSubscriptionEvent): AccessDecision {
  return decideAccess(e.status);
}

// ---------------------------------------------------------------------------
// bcns Connect self-serve billing (item 1). Pure: no clock, no I/O. The hub's
// /pending page and the `stripe-webhook` Edge Function both decide here; the
// Edge Function runs a byte-identical copy (platform/supabase/functions/
// _shared/app-core/subscription.ts, parity-tested) because Deno cannot reach
// this package. The database repeats every precondition in its UPDATE's WHERE.
// ---------------------------------------------------------------------------

const SUB_STATUSES: readonly SubStatus[] = [
  "active", "past_due", "canceled", "trialing", "unpaid", "incomplete", "incomplete_expired", "paused",
];

/** Access kept after a paid-up subscription fails for good or is canceled. */
export const GRACE_SECONDS = 30 * 24 * 60 * 60;

/** The slice of a Stripe event this module reads. Everything else is ignored. */
export interface StripeEvent {
  id: string;
  type: string;
  /** Unix seconds. */
  created: number;
  data: { object: Record<string, unknown> };
}

export interface BillingSignal {
  kind: "paid" | "lapsed";
  /** Event `created`, unix seconds. */
  at: number;
  /** Our client id, from client_reference_id or subscription metadata. */
  clientRef: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** Stripe sends an id string, or the expanded object carrying `id`. */
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v).id);

/**
 * What a Stripe event means for one client's access, or null when it means
 * nothing. Subscription statuses go through decideFromEvent, never re-derived:
 * provision + `active` is a payment (trialing is not — nobody has paid), suspend
 * is a lapse except `past_due`, which only means Stripe is still retrying.
 */
export function billingSignal(event: StripeEvent): BillingSignal | null {
  const o = obj(event.data?.object);
  const at = event.created;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (o.mode !== "subscription" || o.payment_status !== "paid") return null;
      return { kind: "paid", at, clientRef: str(o.client_reference_id), customerId: idOf(o.customer), subscriptionId: idOf(o.subscription) };
    }
    case "invoice.paid": {
      // Basil (2025-03-31) moved invoice.subscription under parent.subscription_details.
      const details = obj(obj(o.parent).subscription_details);
      const subscriptionId = idOf(o.subscription) ?? idOf(details.subscription);
      if (!subscriptionId || typeof o.amount_paid !== "number" || o.amount_paid <= 0) return null;
      const clientRef = str(obj(details.metadata).client_id) ?? str(obj(obj(o.subscription_details).metadata).client_id);
      return { kind: "paid", at, clientRef, customerId: idOf(o.customer), subscriptionId };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const status = o.status as SubStatus;
      if (!SUB_STATUSES.includes(status)) return null;
      const customerId = idOf(o.customer);
      const subscriptionId = idOf(o.id);
      if (!customerId || !subscriptionId) return null;
      const decision = decideFromEvent({ type: event.type, status, customerId, subscriptionId });
      const clientRef = str(obj(o.metadata).client_id);
      if (decision === "provision") {
        return status === "active" ? { kind: "paid", at, clientRef, customerId, subscriptionId } : null;
      }
      return status === "past_due" ? null : { kind: "lapsed", at, clientRef, customerId, subscriptionId };
    }
    default:
      return null;
  }
}

export type ClientStatus = "pending" | "active" | "paused" | "churned";

/** One client's billing row as the database holds it. Times are unix seconds. */
export interface BillingState {
  status: ClientStatus;
  paidAt: number | null;
  graceUntil: number | null;
  subscriptionId: string | null;
  /** Installed through the Shopify App Store and never paid us: Shopify bills them. */
  shopifyBilled: boolean;
  /** Newest Stripe event already applied to this client. */
  lastEventAt: number | null;
}

export type BillingAction =
  | { action: "activate" } // pending -> active
  | { action: "resume" } // paused (after paying before) -> active
  | { action: "record_payment" } // active stays active; clears any grace
  | { action: "flag_duplicate" } // a second live subscription: keep the stored one, alert bcns
  | { action: "start_grace"; graceUntil: number } // active, access ends at graceUntil
  | { action: "ignore"; reason: string };

/**
 * The one place a Stripe signal turns into a status change. Nothing here ever
 * churns, and nothing here ever leaves `churned`.
 */
export function decideBilling(state: BillingState, signal: BillingSignal): BillingAction {
  if (state.shopifyBilled) return { action: "ignore", reason: "shopify_billed" };
  if (state.status === "churned") return { action: "ignore", reason: "churned" };
  if (state.lastEventAt !== null && signal.at < state.lastEventAt) return { action: "ignore", reason: "stale" };

  if (signal.kind === "paid") {
    if (state.status === "pending") return { action: "activate" };
    if (state.status === "active") {
      // The first subscription applied wins. A payment on a different one while the stored one is
      // still live (no lapse seen, so no grace) is a second subscription billing the same client:
      // keep the stored one and alert bcns, never overwrite it silently. In grace or paused the
      // stored one has lapsed, so a new one replaces it.
      const second = state.graceUntil === null && state.subscriptionId !== null &&
        signal.subscriptionId !== null && signal.subscriptionId !== state.subscriptionId;
      return second ? { action: "flag_duplicate" } : { action: "record_payment" };
    }
    // A pause bcns set by hand (never paid through Stripe) is not lifted by a payment.
    return state.paidAt !== null ? { action: "resume" } : { action: "ignore", reason: "paused_by_hand" };
  }

  if (state.paidAt === null) return { action: "ignore", reason: "never_paid" };
  if (state.status !== "active") return { action: "ignore", reason: "not_active" };
  if (state.graceUntil !== null) return { action: "ignore", reason: "already_in_grace" };
  if (state.subscriptionId !== null && signal.subscriptionId !== state.subscriptionId) {
    return { action: "ignore", reason: "other_subscription" };
  }
  return { action: "start_grace", graceUntil: signal.at + GRACE_SECONDS };
}

/**
 * What the hub shows a signed-in user, and the only states where Checkout may
 * start ("pay", "grace"). "none": nothing to pay here (an account bcns bills by
 * hand, or a pause bcns set). "exempt": Shopify bills them, or the account is closed.
 */
export type BillingView = "exempt" | "pay" | "grace" | "paid" | "none";

export function billingView(state: Pick<BillingState, "status" | "paidAt" | "graceUntil" | "shopifyBilled">): BillingView {
  if (state.shopifyBilled || state.status === "churned") return "exempt";
  if (state.status === "pending") return "pay";
  if (state.status === "paused") return state.paidAt !== null ? "pay" : "none";
  if (state.graceUntil !== null) return "grace";
  return state.paidAt !== null ? "paid" : "none";
}

export const canStartCheckout = (view: BillingView): boolean => view === "pay" || view === "grace";
