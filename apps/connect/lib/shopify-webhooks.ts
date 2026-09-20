/**
 * shopify-webhooks.ts — the three privacy webhooks Shopify requires before it
 * will approve an app: `customers/data_request`, `customers/redact` and
 * `shop/redact`.
 *
 * What these must do, and what they deliberately do not:
 *
 * Shopify's requirement is that the endpoints exist, verify the HMAC, and
 * answer 401 when it fails — it tests exactly that during review. The legal
 * requirement behind them is that a request is ACTED ON, within 30 days for a
 * data request and 48 hours after uninstall for `shop/redact`.
 *
 * Deleting the rows is not something this process can do: a merchant's data
 * lives in `data.*` on the platform database, which the hub reaches only through
 * RLS-scoped `api` views as a signed-in member — and a webhook has no session.
 * Writing a privileged delete path for it would mean a service-role credential
 * in the hub, which is exactly what the platform's access model forbids.
 *
 * So these handlers do the honest thing: verify, record, notify a human, 200.
 * A queue table and an operator runbook are the upgrade path, and the volume
 * that justifies one is zero requests a year at the current client count.
 *
 * ponytail: notify-a-human, not an automated redaction. Upgrade to a
 * data.privacy_requests table + a worker task if a client ever receives these at
 * a rate a person cannot service inside the 30-day window.
 */

import { BCNS_EMAIL, REQUEST_FROM, type ResendEmail } from "./request-connection";
import { verifyWebhookHmac } from "./shopify-oauth";

/** The three topics, and the route segment each is served at. */
export const GDPR_TOPICS = {
  "customers/data_request": "customers-data-request",
  "customers/redact": "customers-redact",
  "shop/redact": "shop-redact",
} as const;

export type GdprTopic = keyof typeof GDPR_TOPICS;

/** Shopify's deadline per topic, quoted in the notification so nobody has to look it up. */
const DEADLINE: Record<GdprTopic, string> = {
  "customers/data_request": "30 days — send the merchant the customer's stored data",
  "customers/redact": "30 days — erase that customer's rows",
  "shop/redact": "48 hours from uninstall — erase the shop's data",
};

/**
 * How old X-Shopify-Triggered-At may be. It is the EVENT time and does not change
 * across retries. Shopify documents 8 retries over 4 hours and does not publish a
 * separate schedule for compliance topics, while gdprRoute's own comment records
 * "days" — so 72h clears both with margin and still bounds a replay.
 * NOTE: the header is not covered by the HMAC, so this bounds accidental/stale
 * replays, not an attacker who rewrites the header.
 */
export const MAX_WEBHOOK_AGE_MS = 72 * 60 * 60 * 1000;
/** Tolerated clock skew for a timestamp slightly in the future. */
const FUTURE_SKEW_MS = 60 * 60 * 1000;

/** True only for a parseable RFC-3339 timestamp inside the window. Null/garbage is false. */
export function isFreshTriggeredAt(header: string | null, now: number = Date.now()): boolean {
  if (!header) return false;
  const at = Date.parse(header);
  if (Number.isNaN(at)) return false;
  return at <= now + FUTURE_SKEW_MS && now - at <= MAX_WEBHOOK_AGE_MS;
}

/** Headers that let a human find the request in the Shopify admin. Never the body. */
export type WebhookMeta = { shopDomain: string | null; webhookId: string | null };

/** Unsigned header text going into an email body: one line, bounded. */
const oneLine = (v: string | null): string => (v ? v.replace(/\s+/g, " ").slice(0, 200) : "(none)");

export type WebhookResult =
  | { status: 401; body: { error: string } }
  | { status: 200; body: { ok: true }; notify: ResendEmail };

/**
 * Verify and decide, with no I/O. The raw body string must be the bytes as
 * received: Shopify signs those, and a re-serialised JSON object will not match.
 */
export function handleGdprWebhook(
  topic: GdprTopic,
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
  meta: WebhookMeta = { shopDomain: null, webhookId: null }
): WebhookResult {
  // Fails closed on a missing header, a wrong signature, and a missing secret:
  // verifyWebhookHmac compares against an HMAC of the empty key rather than
  // skipping the check, so a misconfigured deploy rejects instead of accepting.
  if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) return { status: 401, body: { error: "unauthorized" } };

  return {
    status: 200,
    body: { ok: true },
    notify: {
      from: REQUEST_FROM,
      to: [BCNS_EMAIL],
      subject: `Shopify privacy webhook: ${topic}`,
      text: [
        `Topic: ${topic}`,
        `Deadline: ${DEADLINE[topic]}`,
        `Shop: ${oneLine(meta.shopDomain)}`,
        `Webhook id: ${oneLine(meta.webhookId)}`,
        "",
        "Find the request in the Shopify admin by shop + webhook id. The payload is",
        "deliberately not copied here: it carries the customer's identifiers.",
      ].join("\n"),
    },
  };
}
