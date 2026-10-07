/**
 * stripe-billing.ts — self-serve billing on the hub ($200/mo, no setup fee).
 *
 * The hub only ever starts a payment and passes Stripe's webhook on: it creates
 * Checkout and billing-portal sessions with plain `fetch` to Stripe's REST API,
 * and /api/webhooks/stripe verifies the Stripe-Signature and forwards the raw
 * body to the `stripe-webhook` Edge Function, which re-verifies it and is the
 * only thing that changes a client's status. The hub holds no service-role key.
 *
 * Which client is paying always comes from the signed-in user (api.billing_self,
 * keyed on auth.uid()), never from the form.
 */

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@bcn-services/tenant";
import { billingView, canStartCheckout, stripeVerifier, type BillingView, type ClientStatus } from "@bcn-services/app-core";
import type { HubConfig } from "./env";

export const PRICE_LABEL = "$200/mo";
const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_TIMEOUT_MS = 10_000;
const FORWARD_TIMEOUT_MS = 5_000;
/** Stripe's events are a few KB; anything this big is not one. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

export interface BillingSelf {
  clientId: string;
  role: "owner" | "member";
  status: ClientStatus;
  /** Unix seconds. */
  paidAt: number | null;
  graceUntil: number | null;
  shopifyBilled: boolean;
  /** Owners only (the SQL nulls it for members). */
  customerId: string | null;
  view: BillingView;
}

const STATUSES: readonly ClientStatus[] = ["pending", "active", "paused", "churned"];
const seconds = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** api.billing_self's jsonb, or null when it is not the shape we expect. */
export function parseBillingSelf(raw: unknown): BillingSelf | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = STATUSES.find((s) => s === r.status);
  const role = r.role === "owner" || r.role === "member" ? r.role : null;
  if (typeof r.client_id !== "string" || !status || !role) return null;
  const state = {
    status,
    paidAt: seconds(r.paid_at),
    graceUntil: seconds(r.grace_until),
    // Missing reads as Shopify-billed: no Pay button beats a second bill.
    shopifyBilled: r.shopify_billed !== false,
  };
  const customerId = typeof r.stripe_customer_id === "string" && /^cus_[A-Za-z0-9]+$/.test(r.stripe_customer_id) ? r.stripe_customer_id : null;
  return { clientId: r.client_id, role, customerId, ...state, view: billingView(state) };
}

/** The signed-in user's billing row, or null (signed out, no membership, or the RPC is missing). */
export async function readBilling(supabase: SupabaseClient): Promise<BillingSelf | null> {
  const { data, error } = await supabase.schema("api").rpc("billing_self");
  return error ? null : parseBillingSelf(data);
}

/** readBilling for this request, shared by the layout's banner and the /pending page. */
export const loadBilling = cache(async (): Promise<BillingSelf | null> => {
  const supabase = createServerSupabase();
  return supabase ? readBilling(supabase) : null;
});

/** A unix-seconds day as "November 5, 2026". UTC, so the server's zone never shifts it. */
export function formatDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Every Stripe value the hub needs to take a payment; any unset = no Pay button. */
export function stripeReady(config: HubConfig): config is HubConfig & { stripeSecretKey: string; stripePriceId: string } {
  return Boolean(config.stripeSecretKey && config.stripePriceId);
}

/** A Stripe-hosted page URL on exactly `host`, or null: never redirect a user anywhere else. */
export function safeStripeUrl(value: unknown, host: "checkout.stripe.com" | "billing.stripe.com"): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host ? url.toString() : null;
  } catch {
    return null;
  }
}

async function stripePost(
  fetchImpl: typeof fetch,
  secretKey: string,
  path: string,
  form: URLSearchParams,
  host: "checkout.stripe.com" | "billing.stripe.com"
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${STRIPE_API}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[connect] stripe ${path} failed: ${response.status}`);
      return null;
    }
    const body = (await response.json()) as { url?: unknown };
    return safeStripeUrl(body.url, host);
  } catch (error) {
    console.warn(`[connect] stripe ${path} failed: ${error instanceof Error ? error.name : "error"}`);
    return null;
  }
}

/**
 * Where "Pay" sends this user: a Stripe Checkout URL, or a hub path carrying the
 * reason it can't. Owners only, and only in a state that may pay (pending, paused
 * after paying before, or in grace). The client id rides on the session and on
 * the subscription's metadata, which is how the webhook finds the client.
 */
export async function checkoutTarget(
  billing: BillingSelf | null,
  email: string | null,
  config: HubConfig,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!billing) return "/login?error=signed-out";
  if (billing.role !== "owner") return "/pending?error=owner";
  if (!canStartCheckout(billing.view) || !stripeReady(config)) return "/pending";
  const hub = config.hubBaseUrl;
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": config.stripePriceId,
    "line_items[0][quantity]": "1",
    client_reference_id: billing.clientId,
    "subscription_data[metadata][client_id]": billing.clientId,
    // In grace the user is still signed in to a live workspace; otherwise /pending refreshes the session.
    success_url: billing.view === "grace" ? `${hub}/` : `${hub}/pending?paid=1`,
    cancel_url: `${hub}/pending`,
  });
  if (billing.customerId) form.set("customer", billing.customerId);
  else if (email) form.set("customer_email", email);
  return (await stripePost(fetchImpl, config.stripeSecretKey, "checkout/sessions", form, "checkout.stripe.com")) ?? "/pending?error=billing";
}

/** "Update card": Stripe's billing portal for this owner's own customer, or a hub path. */
export async function portalTarget(billing: BillingSelf | null, config: HubConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!billing) return "/login?error=signed-out";
  if (billing.role !== "owner") return "/pending?error=owner";
  if (!billing.customerId || !config.stripeSecretKey) return "/pending";
  const form = new URLSearchParams({ customer: billing.customerId, return_url: `${config.hubBaseUrl}/pending` });
  return (await stripePost(fetchImpl, config.stripeSecretKey, "billing_portal/sessions", form, "billing.stripe.com")) ?? "/pending?error=billing";
}

const json = (status: number, body: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /api/webhooks/stripe. Verifies the signature here (a forged call never
 * reaches the platform), then hands the exact body and header to the Edge
 * Function, which verifies again before writing. Anything but a 2xx from it is a
 * 502, so Stripe retries.
 */
export async function stripeWebhookRoute(
  request: Request,
  config: HubConfig,
  deps: { fetchImpl?: typeof fetch; now?: () => number } = {}
): Promise<Response> {
  if (!config.stripeWebhookSecret || !config.stripeWebhookFunctionUrl) {
    console.warn("[connect] stripe webhook refused: STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_FUNCTION_URL unset");
    return json(503, { error: "unconfigured" });
  }
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_WEBHOOK_BYTES) return json(413, { error: "too_large" });
  // .text(), never .json(): the signature is over these exact bytes.
  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BYTES) return json(413, { error: "too_large" });
  const header = request.headers.get("Stripe-Signature");
  if (!stripeVerifier(config.stripeWebhookSecret, { now: deps.now }).verify(raw, header)) {
    return json(401, { error: "unauthorized" });
  }
  try {
    const response = await (deps.fetchImpl ?? fetch)(config.stripeWebhookFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": header ?? "" },
      body: raw,
      cache: "no-store",
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (response.ok) return json(200, { received: "ok" });
    console.warn(`[connect] stripe webhook forward failed: ${response.status}`);
  } catch (error) {
    console.warn(`[connect] stripe webhook forward failed: ${error instanceof Error ? error.name : "error"}`);
  }
  return json(502, { error: "forward_failed" });
}
