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
  shopifyAppFor,
  signState,
  verifyQueryHmac,
  verifyState,
  verifyWebhookHmac,
} from "../lib/shopify-oauth.ts";
import { GDPR_TOPICS, handleGdprWebhook } from "../lib/shopify-webhooks.ts";
import { gdprRoute } from "../lib/shopify-webhook-route.ts";
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

/**
 * W5a finding 1. All three signatures in shopify-oauth.ts use the SAME key —
 * Shopify signs the callback query and the webhooks with the client secret, so
 * we do not get to pick a different one. Encoding is not a boundary: hex and
 * base64 are the same digest bytes rendered two ways.
 *
 * Before the `state:` prefix, this test FAILED: /start hands any owner a state,
 * and its hex signature re-encoded to base64 was a valid X-Shopify-Hmac-Sha256
 * for the state body — a forged shop/redact telling the operator to erase a
 * client's data inside 48 hours. Every other signature test here is
 * single-domain, which is exactly why nothing caught it.
 */
test("a state signature is not a webhook signature for the same key", () => {
  const [body, hexSig] = signState({ shop: SHOP, clientId: CLIENT }, SECRET).split(".");
  // The attacker's whole move: same digest, re-rendered in the encoding the
  // webhook verifier reads.
  const reencoded = Buffer.from(hexSig, "hex").toString("base64");
  assert.equal(
    verifyWebhookHmac(body, reencoded, SECRET),
    false,
    "state signature must not verify as a webhook signature"
  );
  // The state itself still works — the prefix must not have broken its own domain.
  assert.equal(verifyState(`${body}.${hexSig}`, SECRET, SHOP).ok, true);
});

test("a webhook signature is not a state signature for the same key", () => {
  // The reverse direction, for completeness: base64 webhook digest -> hex.
  const body = Buffer.from(JSON.stringify({ shop: SHOP, clientId: CLIENT, exp: Date.now() + 60000, nonce: "n" }), "utf8").toString("base64url");
  const asWebhook = createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  const asHex = Buffer.from(asWebhook, "base64").toString("hex");
  assert.deepEqual(verifyState(`${body}.${asHex}`, SECRET, SHOP), { ok: false, reason: "bad_signature" });
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
  // Finding 4: the notification must NOT copy the customer's identifiers.
  assert.doesNotMatch(good.notify.text, /191167/);
});

test("all three mandatory topics are handled", () => {
  for (const topic of ["customers/data_request", "customers/redact", "shop/redact"]) {
    assert.equal(handleGdprWebhook(topic, BODY, sign(BODY), SECRET).status, 200);
  }
});

/* ------------------------------------------------- webhook freshness (route) */

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

async function post(triggeredAt, signature = sign(BODY)) {
  process.env.SHOPIFY_CLIENT_SECRET = SECRET;
  delete process.env.RESEND_API_KEY; // sendMail logs and returns: no network
  const headers = { "X-Shopify-Hmac-Sha256": signature };
  if (triggeredAt !== undefined) headers["X-Shopify-Triggered-At"] = triggeredAt;
  const res = await gdprRoute(new Request("http://x/api", { method: "POST", headers, body: BODY }), "customers/redact");
  return res.status;
}

test("a fresh timestamp with a valid signature is accepted", async () => {
  assert.equal(await post(hoursAgo(0)), 200);
});

test("a retry hours old is still accepted (event time survives retries)", async () => {
  assert.equal(await post(hoursAgo(5)), 200);
});

test("a stale timestamp is rejected 401 even with a valid HMAC", async () => {
  assert.equal(await post(hoursAgo(73)), 401);
});

test("a missing X-Shopify-Triggered-At is rejected 401", async () => {
  assert.equal(await post(undefined), 401);
});

test("a malformed X-Shopify-Triggered-At is rejected 401", async () => {
  assert.equal(await post("not-a-date"), 401);
});

test("a fresh timestamp does not rescue a bad signature", async () => {
  assert.equal(await post(hoursAgo(0), sign(BODY, "wrong")), 401);
});

/* ------------------------------------------------------- notification PII */

test("the notification carries topic, deadline, shop and webhook id, and no PII", () => {
  const body = JSON.stringify({ shop_domain: SHOP, customer: { id: 191167, email: "a@b.example", phone: "+15550100" } });
  const r = handleGdprWebhook("customers/redact", body, sign(body), SECRET, {
    shopDomain: SHOP,
    webhookId: "wh-1234",
  });
  assert.equal(r.status, 200);
  const t = r.notify.text;
  assert.match(t, /customers\/redact/);
  assert.match(t, /Deadline: 30 days/);
  assert.ok(t.includes(SHOP));
  assert.ok(t.includes("wh-1234"));
  assert.ok(!t.includes(body));
  assert.ok(!t.includes("a@b.example"));
  assert.ok(!t.includes("+15550100"));
  assert.ok(!t.includes("191167"));
});

test("unsigned headers cannot inject lines or bloat the notification", () => {
  const r = handleGdprWebhook("customers/redact", BODY, sign(BODY), SECRET, {
    shopDomain: "x.myshopify.com\nDeadline: none",
    webhookId: "a".repeat(5000),
  });
  const lines = r.notify.text.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("Deadline:")).length, 1);
  assert.ok(r.notify.text.length < 1000);
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
  // The callback seals both into the hand-off; /finish writes them.
  const route = readFileSync(new URL("../app/api/oauth/shopify/callback/route.ts", import.meta.url), "utf8");
  assert.match(route, /refreshToken:\s*exchanged\.token\.refreshToken/);
  assert.match(route, /expiresAt:[^\n]*exchanged\.token\.expiresIn\s*\*\s*1000/);
  const finish = readFileSync(new URL("../app/api/oauth/shopify/finish/route.ts", import.meta.url), "utf8");
  assert.match(finish, /p_refresh_secret:\s*pending\.refreshToken/);
  assert.match(finish, /p_expires_at:\s*pending\.expiresAt/);
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
test("the auth middleware leaves the webhooks and the Shopify handshake open, and gates the hub", () => {
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const matcher = source.match(/matcher:\s*\["([^"]+)"\]/);
  assert.ok(matcher, "no matcher found in middleware.ts");
  const gated = new RegExp(`^${matcher[1]}$`);

  for (const open of [
    "/api/webhooks/shopify/customers-data-request",
    "/api/webhooks/shopify/customers-redact",
    "/api/webhooks/shopify/shop-redact",
    "/api/health",
    // A Shopify-initiated install reaches these with no bcns session; each checks for itself.
    "/api/oauth/shopify/start",
    "/api/oauth/shopify/callback",
    "/api/oauth/shopify/finish",
  ]) {
    assert.equal(gated.test(open), false, `${open} must not require a session`);
  }
  for (const closed of ["/api/oauth/meta/start", "/api/oauth/monday/callback", "/", "/team", "/access"]) {
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

/* ------------------------------------------- sb-bridge: remove after SB migrates to bcns Connect */

const ALT_SHOP = "saunaboy-2.myshopify.com";
const ALT_SECRET = "shpss_alt_secret";
const BRIDGED = {
  ...CONFIGURED,
  shopifyClientSecret: SECRET,
  shopifyAltShop: ALT_SHOP,
  shopifyAltClientId: "alt-cid",
  shopifyAltClientSecret: ALT_SECRET,
};
const DEFAULT_PAIR = { clientId: "cid", clientSecret: SECRET };

test("sb-bridge: all three ALT vars set -> the alt shop gets the alt pair and the marker", () => {
  assert.deepEqual(shopifyAppFor(BRIDGED, ALT_SHOP), { clientId: "alt-cid", clientSecret: ALT_SECRET, app: "bcns-data" });
  // Exact match after normalizeShop, on both sides.
  assert.deepEqual(shopifyAppFor({ ...BRIDGED, shopifyAltShop: "SaunaBoy-2" }, ALT_SHOP).app, "bcns-data");
  // Every other shop, and a missing shop, keeps the default pair.
  assert.deepEqual(shopifyAppFor(BRIDGED, SHOP), DEFAULT_PAIR);
  assert.deepEqual(shopifyAppFor(BRIDGED, "saunaboy-2x.myshopify.com"), DEFAULT_PAIR);
  assert.deepEqual(shopifyAppFor(BRIDGED, null), DEFAULT_PAIR);
});

test("sb-bridge: ALT vars unset or partially set -> the default pair, exactly as before", () => {
  const unset = { ...BRIDGED, shopifyAltShop: undefined, shopifyAltClientId: undefined, shopifyAltClientSecret: undefined };
  assert.deepEqual(shopifyAppFor(unset, ALT_SHOP), DEFAULT_PAIR);
  for (const k of ["shopifyAltShop", "shopifyAltClientId", "shopifyAltClientSecret"]) {
    assert.deepEqual(shopifyAppFor({ ...BRIDGED, [k]: undefined }, ALT_SHOP), DEFAULT_PAIR, `${k} unset`);
  }
});

/** The callback's steps 2-3, in the route's order: choose by raw shop, then verify with that one pair. */
function callbackAccepts(config, params) {
  const shop = normalizeShop(params.get("shop"));
  const { clientSecret } = shopifyAppFor(config, shop);
  if (!verifyQueryHmac(params, clientSecret)) return false;
  return verifyState(params.get("state"), clientSecret, shop).ok;
}

function callbackQuery(shop, secret) {
  const state = signState({ shop, clientId: CLIENT }, secret);
  return signQuery(new URLSearchParams({ code: "abc123", shop, state, timestamp: "1700000000" }), secret);
}

test("sb-bridge: each app's callback verifies only under its own secret", () => {
  assert.equal(callbackAccepts(BRIDGED, callbackQuery(ALT_SHOP, ALT_SECRET)), true);
  assert.equal(callbackAccepts(BRIDGED, callbackQuery(SHOP, SECRET)), true);
});

test("sb-bridge: shop=saunaboy-2 signed with bcns Connect's secret is rejected", () => {
  assert.equal(callbackAccepts(BRIDGED, callbackQuery(ALT_SHOP, SECRET)), false);
});

test("sb-bridge: any other shop signed with bcns-data's secret is rejected", () => {
  assert.equal(callbackAccepts(BRIDGED, callbackQuery(SHOP, ALT_SECRET)), false);
});

test("sb-bridge: the callback route picks the pair before the query HMAC and uses only that pair", () => {
  const route = readFileSync(new URL("../app/api/oauth/shopify/callback/route.ts", import.meta.url), "utf8");
  const pick = route.indexOf("shopifyAppFor(config, normalizeShop(params.get(\"shop\")))");
  assert.ok(pick > 0, "callback does not choose its pair with shopifyAppFor");
  assert.ok(pick < route.indexOf("verifyQueryHmac(params, secret)"), "pair chosen after the query HMAC");
  // The default secret appears once, as the key that seals the hand-off cookie.
  assert.doesNotMatch(route, /config\.shopifyClientId/, "callback reads the default pair directly");
  assert.equal(route.match(/config\.shopifyClientSecret/g)?.length, 1);
  assert.match(route, /config\.shopifyClientSecret!\s*\);\s*const done/);
  assert.match(route, /exchange\(shop, clientId, secret, code\)/);
  assert.match(route, /^\s*app, \/\/ sb-bridge/m);
  const finish = readFileSync(new URL("../app/api/oauth/shopify/finish/route.ts", import.meta.url), "utf8");
  assert.match(finish, /p_config:\s*scheduleConfig\(pending\.shop, pending\.app\)/);
});

test("sb-bridge: the marker is written only for the alt pair", () => {
  assert.deepEqual(scheduleConfig(ALT_SHOP, shopifyAppFor(BRIDGED, ALT_SHOP).app), {
    shop: ALT_SHOP,
    admin_url: "https://admin.shopify.com/store/saunaboy-2",
    app: "bcns-data",
  });
  assert.equal("app" in scheduleConfig(SHOP, shopifyAppFor(BRIDGED, SHOP).app), false);
  assert.equal("app" in scheduleConfig(ALT_SHOP, shopifyAppFor({ ...BRIDGED, shopifyAltClientSecret: undefined }, ALT_SHOP).app), false);
});
