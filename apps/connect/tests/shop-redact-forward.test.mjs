/**
 * shop/redact automation (docs/architecture/retention-30d-shop-redact.md):
 * 1. gdprRoute forwards only `shop/redact`, only when SHOP_REDACT_FUNCTION_URL
 *    is set, and only AFTER its own HMAC check already passed.
 * 2. A forward success (2xx) short-circuits before the operator email; any
 *    forward failure (unset URL, network error, timeout, non-2xx) falls back
 *    to that email exactly as before shop/redact was automated.
 * 3. The Edge Function's own HMAC verifier (platform/supabase/functions/_shared/
 *    shopify-hmac.ts) must agree with this app's verifyWebhookHmac on shared
 *    vectors — two independently-run checks that silently diverged would be
 *    worse than one, not better.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookHmac } from "../lib/shopify-oauth.ts";
import { gdprRoute } from "../lib/shopify-webhook-route.ts";
// Zero-import, WebCrypto-only file — safe to pull in from here (see its own
// header comment for why the reverse direction does not work).
import { verifyShopifyHmac } from "../../../platform/supabase/functions/_shared/shopify-hmac.ts";

const SECRET = "shpss_test_secret";
const SHOP = "acme-detailing.myshopify.com";
const BODY = JSON.stringify({ shop_domain: SHOP });
const sign = (body, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("base64");
const FN_URL = "https://edge.example/functions/v1/shopify-shop-redact";

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

function recorder(response) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push({ url, init }); return response; } };
}

async function postShopRedact(deps) {
  const headers = {
    "X-Shopify-Hmac-Sha256": sign(BODY),
    "X-Shopify-Webhook-Id": "wh-1",
    "X-Shopify-Triggered-At": new Date().toISOString(),
  };
  return gdprRoute(new Request("http://x/api", { method: "POST", headers, body: BODY }), "shop/redact", deps);
}

/* --------------------------------------------------------- HMAC parity */

test("verifyShopifyHmac (Edge Function) agrees with verifyWebhookHmac (hub) on a genuine signature", async () => {
  assert.equal(verifyWebhookHmac(BODY, sign(BODY), SECRET), true);
  assert.equal(await verifyShopifyHmac(new TextEncoder().encode(BODY), sign(BODY), SECRET), true);
});

test("verifyShopifyHmac agrees with verifyWebhookHmac on a tampered body", async () => {
  const header = sign(BODY);
  const tampered = JSON.stringify({ shop_domain: "evil.myshopify.com" });
  assert.equal(verifyWebhookHmac(tampered, header, SECRET), false);
  assert.equal(await verifyShopifyHmac(new TextEncoder().encode(tampered), header, SECRET), false);
});

test("verifyShopifyHmac agrees with verifyWebhookHmac on a wrong secret", async () => {
  const header = sign(BODY, "wrong-secret");
  assert.equal(verifyWebhookHmac(BODY, header, SECRET), false);
  assert.equal(await verifyShopifyHmac(new TextEncoder().encode(BODY), header, SECRET), false);
});

test("verifyShopifyHmac agrees with verifyWebhookHmac on a missing header", async () => {
  assert.equal(verifyWebhookHmac(BODY, null, SECRET), false);
  assert.equal(await verifyShopifyHmac(new TextEncoder().encode(BODY), null, SECRET), false);
});

test("verifyShopifyHmac fails closed on a missing secret (the Edge Function has no other auth)", async () => {
  assert.equal(await verifyShopifyHmac(new TextEncoder().encode(BODY), sign(BODY), ""), false);
});

/* ------------------------------------------------------- hub forwarding */

test("shop/redact: a 2xx forward short-circuits before the operator email, and returns 200", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: FN_URL, RESEND_API_KEY: "should-not-be-used" }, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("sendMail must not run when the forward already succeeded"); };
    try {
      const res = await postShopRedact({ fetchImpl: fwd.fetchImpl });
      assert.equal(res.status, 200);
      assert.equal(fwd.calls.length, 1, "exactly one forward attempt");
      const { url, init } = fwd.calls[0];
      assert.equal(url, FN_URL);
      assert.equal(init.method, "POST");
      assert.equal(init.body, BODY, "forwards the exact raw bytes the HMAC was checked over");
      assert.equal(init.headers["X-Shopify-Hmac-Sha256"], sign(BODY));
      assert.equal(init.headers["X-Shopify-Webhook-Id"], "wh-1");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test("shop/redact: a non-2xx forward falls back to the operator email, and still returns 200", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: FN_URL, RESEND_API_KEY: "test-key" }, async () => {
    const fwd = recorder(new Response(null, { status: 500 }));
    const mail = recorder(new Response(null, { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = mail.fetchImpl;
    try {
      const res = await postShopRedact({ fetchImpl: fwd.fetchImpl });
      assert.equal(res.status, 200);
      assert.equal(fwd.calls.length, 1);
      assert.equal(mail.calls.length, 1, "operator email sent after the forward failed");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test("shop/redact: a forward network error falls back to the operator email", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: FN_URL, RESEND_API_KEY: "test-key" }, async () => {
    const mail = recorder(new Response(null, { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = mail.fetchImpl;
    try {
      const res = await postShopRedact({ fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
      assert.equal(res.status, 200);
      assert.equal(mail.calls.length, 1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test("shop/redact: SHOP_REDACT_FUNCTION_URL unset never attempts a forward, and falls back to email", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: "", RESEND_API_KEY: "test-key" }, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const mail = recorder(new Response(null, { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = mail.fetchImpl;
    try {
      const res = await postShopRedact({ fetchImpl: fwd.fetchImpl });
      assert.equal(res.status, 200);
      assert.equal(fwd.calls.length, 0, "no URL configured means no forward attempt");
      assert.equal(mail.calls.length, 1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test("customers/redact never forwards even when SHOP_REDACT_FUNCTION_URL is set", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: FN_URL, RESEND_API_KEY: "test-key" }, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const mail = recorder(new Response(null, { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = mail.fetchImpl;
    const headers = {
      "X-Shopify-Hmac-Sha256": sign(BODY),
      "X-Shopify-Webhook-Id": "wh-1",
      "X-Shopify-Triggered-At": new Date().toISOString(),
    };
    try {
      const res = await gdprRoute(new Request("http://x/api", { method: "POST", headers, body: BODY }), "customers/redact", { fetchImpl: fwd.fetchImpl });
      assert.equal(res.status, 200);
      assert.equal(fwd.calls.length, 0, "only shop/redact ever forwards");
      assert.equal(mail.calls.length, 1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test("customers/data_request never forwards even when SHOP_REDACT_FUNCTION_URL is set", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: FN_URL, RESEND_API_KEY: "test-key" }, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const mail = recorder(new Response(null, { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = mail.fetchImpl;
    const headers = {
      "X-Shopify-Hmac-Sha256": sign(BODY),
      "X-Shopify-Webhook-Id": "wh-1",
      "X-Shopify-Triggered-At": new Date().toISOString(),
    };
    try {
      const res = await gdprRoute(new Request("http://x/api", { method: "POST", headers, body: BODY }), "customers/data_request", { fetchImpl: fwd.fetchImpl });
      assert.equal(res.status, 200);
      assert.equal(fwd.calls.length, 0);
      assert.equal(mail.calls.length, 1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test("shop/redact: a bad HMAC 401s before any forward is attempted", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: FN_URL }, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const headers = {
      "X-Shopify-Hmac-Sha256": sign(BODY, "wrong"),
      "X-Shopify-Webhook-Id": "wh-1",
      "X-Shopify-Triggered-At": new Date().toISOString(),
    };
    const res = await gdprRoute(new Request("http://x/api", { method: "POST", headers, body: BODY }), "shop/redact", { fetchImpl: fwd.fetchImpl });
    assert.equal(res.status, 401);
    assert.equal(fwd.calls.length, 0);
  });
});
