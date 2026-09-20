/**
 * The Shopify handshake's security properties, asserted without a server, a
 * database or a Shopify account. Every check here is one that, if it silently
 * stopped working, would still return 200 and still look like it worked — which
 * is the whole reason these exist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  SHOPIFY_DEFAULTS,
  SHOPIFY_SCOPES,
  STATE_TTL_MS,
  handleTokenResponse,
  installUrl,
  normalizeShop,
  safeEqual,
  scheduleConfig,
  signState,
  verifyQueryHmac,
  verifyState,
  verifyWebhookHmac,
} from "../lib/shopify-oauth.ts";
import { GDPR_TOPICS, handleGdprWebhook } from "../lib/shopify-webhooks.ts";
import { connectPath, oauthEnabled, redirectUri } from "../lib/oauth-config.ts";

const SECRET = "shpss_test_secret";
const SHOP = "acme-detailing.myshopify.com";
const CLIENT = "11111111-2222-3333-4444-555555555555";

/* ------------------------------------------------------------------ shop */

test("normalizeShop accepts the forms a merchant might type", () => {
  assert.equal(normalizeShop("acme-detailing"), SHOP);
  assert.equal(normalizeShop(SHOP), SHOP);
  assert.equal(normalizeShop("https://acme-detailing.myshopify.com/"), SHOP);
  assert.equal(normalizeShop("  ACME-Detailing.MyShopify.com "), SHOP);
  // A path is discarded, not treated as part of the host: the canonical origin
  // is what survives, which is exactly what we want to redirect to.
  assert.equal(normalizeShop("acme-detailing.myshopify.com/../evil"), SHOP);
});

test("normalizeShop refuses anything that is not a myshopify host", () => {
  // Each of these, accepted, is an open redirect and a token exchange pointed
  // at a host the attacker controls.
  for (const bad of [
    "evil.com",
    "acme.myshopify.com.evil.com",
    "-leading-dash.myshopify.com",
    "",
    null,
    undefined,
    "acme myshopify com",
  ]) {
    assert.equal(normalizeShop(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

/* ----------------------------------------------------------------- state */

test("a freshly signed state verifies for its own shop", () => {
  const state = signState({ shop: SHOP, clientId: CLIENT }, SECRET);
  const result = verifyState(state, SECRET, SHOP);
  assert.equal(result.ok, true);
  assert.equal(result.payload.shop, SHOP);
  assert.equal(result.payload.clientId, CLIENT);
});

test("a tampered state payload is rejected", () => {
  const state = signState({ shop: SHOP, clientId: CLIENT }, SECRET);
  const [body, signature] = state.split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  forged.clientId = "99999999-9999-9999-9999-999999999999";
  const swapped = `${Buffer.from(JSON.stringify(forged), "utf8").toString("base64url")}.${signature}`;
  assert.deepEqual(verifyState(swapped, SECRET, SHOP), { ok: false, reason: "bad_signature" });
});

test("a state signed with a different secret is rejected", () => {
  const state = signState({ shop: SHOP, clientId: CLIENT }, "someone-elses-secret");
  assert.deepEqual(verifyState(state, SECRET, SHOP), { ok: false, reason: "bad_signature" });
});

test("an expired state is rejected", () => {
  const now = Date.now();
  const state = signState({ shop: SHOP, clientId: CLIENT }, SECRET, now);
  assert.equal(verifyState(state, SECRET, SHOP, now + STATE_TTL_MS - 1).ok, true);
  assert.deepEqual(
    verifyState(state, SECRET, SHOP, now + STATE_TTL_MS + 1),
    { ok: false, reason: "expired" }
  );
});

test("a state minted for one shop cannot complete another shop's callback", () => {
  const state = signState({ shop: SHOP, clientId: CLIENT }, SECRET);
  assert.deepEqual(
    verifyState(state, SECRET, "other-store.myshopify.com"),
    { ok: false, reason: "shop_mismatch" }
  );
});

test("a missing or shapeless state is malformed, never accepted", () => {
  for (const bad of ["", null, undefined, "nodot", "a.b.c", ".", "x."]) {
    assert.equal(verifyState(bad, SECRET, SHOP).ok, false);
  }
});

test("two states minted back to back differ", () => {
  // A fixed state would be replayable for the whole TTL.
  const a = signState({ shop: SHOP, clientId: CLIENT }, SECRET);
  const b = signState({ shop: SHOP, clientId: CLIENT }, SECRET);
  assert.notEqual(a, b);
});

/* ------------------------------------------------------- callback query HMAC */

/** Sign a query the way Shopify does: sorted, `hmac` excluded, hex. */
function signQuery(params, secret) {
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac")
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
  return params;
}

test("a genuine Shopify callback query verifies", () => {
  const params = signQuery(
    new URLSearchParams({ code: "abc123", shop: SHOP, state: "st", timestamp: "1700000000" }),
    SECRET
  );
  assert.equal(verifyQueryHmac(params, SECRET), true);
});

test("a tampered callback query is rejected", () => {
  const params = signQuery(
    new URLSearchParams({ code: "abc123", shop: SHOP, state: "st", timestamp: "1700000000" }),
    SECRET
  );
  // Swapping the shop after signing: the classic attempt to redirect the
  // exchange at a store the attacker owns.
  params.set("shop", "evil-store.myshopify.com");
  assert.equal(verifyQueryHmac(params, SECRET), false);
});

test("a callback query with no hmac at all fails closed", () => {
  const params = new URLSearchParams({ code: "abc123", shop: SHOP, state: "st" });
  assert.equal(verifyQueryHmac(params, SECRET), false);
});

test("the query hmac is checked against our secret, not any secret", () => {
  const params = signQuery(new URLSearchParams({ code: "abc", shop: SHOP }), "not-our-secret");
  assert.equal(verifyQueryHmac(params, SECRET), false);
});

/* ---------------------------------------------------------- webhook HMAC */

const BODY = JSON.stringify({ shop_domain: SHOP, customer: { id: 191167, email: "a@b.example" } });
const sign = (body, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("base64");

test("a genuine webhook signature verifies (base64, over the raw body)", () => {
  assert.equal(verifyWebhookHmac(BODY, sign(BODY), SECRET), true);
});

test("a tampered webhook payload is rejected", () => {
  const header = sign(BODY);
  const tampered = JSON.stringify({ shop_domain: "evil.myshopify.com", customer: { id: 1 } });
  assert.equal(verifyWebhookHmac(tampered, header, SECRET), false);
});

test("a webhook with a missing or empty signature fails closed", () => {
  assert.equal(verifyWebhookHmac(BODY, null, SECRET), false);
  assert.equal(verifyWebhookHmac(BODY, "", SECRET), false);
});

test("a hex-encoded webhook signature is not accepted for a base64 header", () => {
  // The encoding is the bug that would silently accept nothing and look like
  // a Shopify outage — or, reversed, accept everything.
  const hex = createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");
  assert.equal(verifyWebhookHmac(BODY, hex, SECRET), false);
});

test("handleGdprWebhook 401s a bad signature and 200s a good one", () => {
  const bad = handleGdprWebhook("customers/redact", BODY, sign(BODY, "wrong"), SECRET);
  assert.equal(bad.status, 401);
  assert.equal(bad.notify, undefined);

  const good = handleGdprWebhook("customers/redact", BODY, sign(BODY), SECRET);
  assert.equal(good.status, 200);
  assert.deepEqual(good.body, { ok: true });
  assert.match(good.notify.subject, /customers\/redact/);
  // The verified payload has to reach a human; that is the whole handler.
  assert.match(good.notify.text, /191167/);
});

test("all three mandatory topics are handled", () => {
  for (const topic of ["customers/data_request", "customers/redact", "shop/redact"]) {
    assert.equal(handleGdprWebhook(topic, BODY, sign(BODY), SECRET).status, 200);
  }
});

/* -------------------------------------------------------- token exchange */

const GRANTED = SHOPIFY_SCOPES.join(",");

test("a good token response yields the token, its scopes and its lifetime", () => {
  const result = handleTokenResponse(200, {
    access_token: "shpat_abc", scope: GRANTED, expires_in: 3600,
    refresh_token: "shprt_xyz", refresh_token_expires_in: 7776000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.token.accessToken, "shpat_abc");
  assert.deepEqual(result.token.scopes, [...SHOPIFY_SCOPES]);
  assert.equal(result.token.expiresIn, 3600);
  assert.equal(result.token.refreshToken, "shprt_xyz");
});

test("a token with no expires_in is refused: it is the non-expiring kind the Admin API 403s", () => {
  // Real failure, 2026-09-19: the install wrote a row, then every worker run
  // came back "[API] Non-expiring access tokens are no longer accepted".
  const result = handleTokenResponse(200, { access_token: "shpat_abc", scope: GRANTED });
  assert.deepEqual(result, { ok: false, reason: "not_expiring", detail: "no expires_in" });
});

test("a non-2xx token response is an http_error, not a token", () => {
  const result = handleTokenResponse(400, { error: "invalid_request" });
  assert.deepEqual(result, { ok: false, reason: "http_error", detail: "HTTP 400" });
});

test("a 200 with no access_token is malformed", () => {
  for (const body of [null, {}, { access_token: "" }, { access_token: 42 }]) {
    assert.deepEqual(handleTokenResponse(200, body), { ok: false, reason: "malformed" });
  }
});

test("a token granted fewer scopes than we asked for is refused, and says which", () => {
  // The merchant's plan can silently narrow the grant. Storing this token would
  // pass onboarding and then fail the §9 checklist on the first worker run.
  const short = SHOPIFY_SCOPES.filter((s) => s !== "read_all_orders").join(",");
  const result = handleTokenResponse(200, { access_token: "shpat_abc", scope: short });
  assert.deepEqual(result, { ok: false, reason: "missing_scopes", detail: "read_all_orders" });
});

test("extra scopes beyond the eight are fine", () => {
  const result = handleTokenResponse(200, { access_token: "t", scope: `${GRANTED},read_locations`, expires_in: 3600 });
  assert.equal(result.ok, true);
});

test("the scope list opens every field the worker actually queries", () => {
  // read_shopify_payments_payouts does NOT open the shopifyPaymentsAccount root
  // field Q_PAYOUTS selects; Shopify grants it anyway, so the gap only appeared
  // on the first real install (ACCESS_DENIED, 2026-09-19). The accounts scope is
  // what opens it, and nothing in the handshake can detect its absence.
  assert.ok(SHOPIFY_SCOPES.includes("read_shopify_payments_accounts"));
});

test("the callback asks Shopify for an expiring token", () => {
  // handleTokenResponse refuses a non-expiring token, so forgetting `expiring`
  // on the POST body would fail every install rather than fail it late. The
  // parameter goes in the token-exchange body, never on the authorize redirect.
  const route = readFileSync(new URL("../app/api/oauth/shopify/callback/route.ts", import.meta.url), "utf8");
  assert.match(route, /expiring:\s*"1"/);
});

test("the callback stores the refresh token and the expiry, not just the access token", () => {
  // The access token dies in an hour. Without BOTH of these on the RPC call the row
  // is unrenewable — the worker's refresh query skips a null expires_at, and there is
  // no refresh_secret to spend even if it did not. This failed silently in W3: the
  // install succeeded, the dashboard said connected, and the merchant was cut off by
  // the afternoon. Nothing at runtime reports it, so the assertion lives here.
  const route = readFileSync(new URL("../app/api/oauth/shopify/callback/route.ts", import.meta.url), "utf8");
  assert.match(route, /p_refresh_secret:\s*exchanged\.token\.refreshToken/);
  assert.match(route, /p_expires_at:/);
  assert.match(route, /exchanged\.token\.expiresIn\s*\*\s*1000/);
});

/* -------------------------------------------------------------- assembly */

test("the install url carries the app, the scopes, the redirect and the state", () => {
  const state = signState({ shop: SHOP, clientId: CLIENT }, SECRET);
  const url = new URL(installUrl(SHOP, "client-id-123", "https://connect.bcn-services.com/api/oauth/shopify/callback", state));
  assert.equal(url.host, SHOP);
  assert.equal(url.pathname, "/admin/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "client-id-123");
  assert.equal(url.searchParams.get("scope"), GRANTED);
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://connect.bcn-services.com/api/oauth/shopify/callback"
  );
});

test("scheduleConfig writes the same keys add-source prompts for", () => {
  // PROMPTS.shopify in platform/scripts/onboard.ts: ['shop', 'admin_url'].
  assert.deepEqual(scheduleConfig(SHOP), {
    shop: SHOP,
    admin_url: "https://admin.shopify.com/store/acme-detailing",
  });
});

test("safeEqual is correct on equal, different and different-length inputs", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});

/* ------------------------------------------------------- the approval gate */

const CONFIGURED = {
  shopifyClientId: "cid",
  shopifyClientSecret: "csecret",
  approvedOAuthSources: ["shopify"],
  hubBaseUrl: "https://connect.bcn-services.com",
};

test("a source is self-serve only when approved AND configured", () => {
  assert.equal(oauthEnabled(CONFIGURED, "shopify"), true);
  assert.equal(oauthEnabled({ ...CONFIGURED, approvedOAuthSources: [] }, "shopify"), false);
  assert.equal(oauthEnabled({ ...CONFIGURED, shopifyClientSecret: undefined }, "shopify"), false);
  assert.equal(oauthEnabled({ ...CONFIGURED, shopifyClientId: undefined }, "shopify"), false);
});

test("sources with no flow built are never self-serve, however they are listed", () => {
  const listed = { ...CONFIGURED, approvedOAuthSources: ["shopify", "meta", "monday", "drive"] };
  for (const source of ["meta", "monday", "meet", "drive"]) {
    assert.equal(oauthEnabled(listed, source), false, `${source} must not be self-serve in W2`);
    assert.equal(connectPath(listed, source), null);
  }
  assert.equal(connectPath(listed, "shopify"), "/api/oauth/shopify/start");
});

test("the redirect uri matches the one registered in the partner dashboard", () => {
  assert.equal(redirectUri(CONFIGURED, "shopify"), "https://connect.bcn-services.com/api/oauth/shopify/callback");
});

/* ------------------------------------------- drift against platform/ source */

/**
 * apps/connect cannot import the worker, so three constants are mirrored. These
 * two checks are the cheap half of the import that is not allowed: they read the
 * real files and fail if either side moves.
 */
test("SHOPIFY_DEFAULTS still match shopify.defaults in the connector", () => {
  const connector = readFileSync(new URL("../../../platform/worker/src/connectors/shopify.ts", import.meta.url), "utf8");
  assert.match(connector, new RegExp(`interval:\\s*'${SHOPIFY_DEFAULTS.interval}'`));
  assert.match(connector, new RegExp(`backfillDepth:\\s*'${SHOPIFY_DEFAULTS.backfillDepth}'`));
});

test("SHOPIFY_SCOPES still match the scopes the §9 checklist demands", () => {
  const checklist = readFileSync(new URL("../../../platform/scripts/checklist.ts", import.meta.url), "utf8");
  const line = checklist.match(/const SHOPIFY_SCOPES = \[([^\]]*)\]/);
  assert.ok(line, "SHOPIFY_SCOPES not found in platform/scripts/checklist.ts");
  const fromChecklist = line[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
  // Requesting fewer than the checklist demands mints a token that fails §9.
  assert.deepEqual([...SHOPIFY_SCOPES].sort(), fromChecklist.sort());
});

/* ------------------------------------------------------------- middleware */

/**
 * Shopify calls the privacy webhooks server-to-server with no cookie. If the
 * hub's auth middleware matches them they answer 307 to /login, Shopify records
 * a failed webhook, and the app is rejected at review — with every unit test
 * above still green. Hence this one, which reads the real matcher.
 */
test("the auth middleware leaves the webhooks open and keeps the oauth routes gated", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const matcher = source.match(/matcher:\s*\["([^"]+)"\]/);
  assert.ok(matcher, "no matcher found in middleware.ts");
  const gated = new RegExp(`^${matcher[1]}$`);

  for (const open of [
    "/api/webhooks/shopify/customers-data-request",
    "/api/webhooks/shopify/customers-redact",
    "/api/webhooks/shopify/shop-redact",
    "/api/health",
  ]) {
    assert.equal(gated.test(open), false, `${open} must not require a session`);
  }
  for (const closed of ["/api/oauth/shopify/start", "/api/oauth/shopify/callback", "/", "/team"]) {
    assert.equal(gated.test(closed), true, `${closed} must require a session`);
  }
});

test("every GDPR topic has a route directory named after it", () => {
  // A topic registered in the dashboard with no route is a 404 at review time.
  for (const segment of Object.values(GDPR_TOPICS)) {
    const route = new URL(`../app/api/webhooks/shopify/${segment}/route.ts`, import.meta.url);
    assert.ok(readFileSync(route, "utf8").includes("gdprRoute"), `${segment} route missing`);
  }
});
