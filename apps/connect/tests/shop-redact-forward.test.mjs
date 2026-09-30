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
 * 4. app/uninstalled (rule 1.2.2) forwards through the same function, but a
 *    failed forward is a non-2xx: nothing else would do the revoke, so Shopify
 *    must retry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookHmac } from "../lib/shopify-oauth.ts";
import { appUninstalledRoute, gdprRoute } from "../lib/shopify-webhook-route.ts";
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
    "X-Shopify-Topic": "shop/redact",
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
      assert.equal(init.headers["X-Shopify-Topic"], "shop/redact", "topic forwarded for the Edge Function's check");
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

/* ------------------------------------------------------- app/uninstalled */

// Shopify's app/uninstalled payload is the Shop object: myshopify_domain, no shop_domain.
const UNINSTALL_BODY = JSON.stringify({ id: 1, name: "Acme", domain: "acme.example", myshopify_domain: SHOP });

function postUninstall(deps, overrides = {}) {
  const headers = {
    "X-Shopify-Hmac-Sha256": sign(UNINSTALL_BODY),
    "X-Shopify-Webhook-Id": "wh-u1",
    "X-Shopify-Triggered-At": new Date().toISOString(),
    "X-Shopify-Topic": "app/uninstalled",
    ...overrides,
  };
  return appUninstalledRoute(new Request("http://x/api", { method: "POST", headers, body: UNINSTALL_BODY }), deps);
}

const UNINSTALL_ENV = { SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: FN_URL };

test("app/uninstalled: a verified delivery is forwarded byte-for-byte with its topic and triggered-at, and returns 200", async () => {
  await withEnv(UNINSTALL_ENV, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const triggeredAt = new Date().toISOString();
    const res = await postUninstall({ fetchImpl: fwd.fetchImpl }, { "X-Shopify-Triggered-At": triggeredAt });
    assert.equal(res.status, 200);
    assert.equal(fwd.calls.length, 1);
    const { url, init } = fwd.calls[0];
    assert.equal(url, FN_URL);
    assert.equal(init.body, UNINSTALL_BODY);
    assert.equal(init.headers["X-Shopify-Hmac-Sha256"], sign(UNINSTALL_BODY));
    assert.equal(init.headers["X-Shopify-Topic"], "app/uninstalled");
    assert.equal(init.headers["X-Shopify-Triggered-At"], triggeredAt);
  });
});

test("app/uninstalled: a bad HMAC 401s before any forward is attempted", async () => {
  await withEnv(UNINSTALL_ENV, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const res = await postUninstall({ fetchImpl: fwd.fetchImpl }, { "X-Shopify-Hmac-Sha256": sign(UNINSTALL_BODY, "wrong") });
    assert.equal(res.status, 401);
    assert.equal(fwd.calls.length, 0);
  });
});

test("app/uninstalled: a stale or missing X-Shopify-Triggered-At 401s before any forward", async () => {
  await withEnv(UNINSTALL_ENV, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    const stale = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(); // window is 72h
    assert.equal((await postUninstall({ fetchImpl: fwd.fetchImpl }, { "X-Shopify-Triggered-At": stale })).status, 401);
    assert.equal((await postUninstall({ fetchImpl: fwd.fetchImpl }, { "X-Shopify-Triggered-At": "" })).status, 401);
    assert.equal(fwd.calls.length, 0);
  });
});

test("app/uninstalled: no SHOPIFY_CLIENT_SECRET is a 401, never a forward", async () => {
  await withEnv({ SHOPIFY_CLIENT_SECRET: "", SHOP_REDACT_FUNCTION_URL: FN_URL }, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    assert.equal((await postUninstall({ fetchImpl: fwd.fetchImpl })).status, 401);
    assert.equal(fwd.calls.length, 0);
  });
});

test("app/uninstalled: a failed forward is a non-2xx so Shopify retries — non-2xx, network error, and URL unset", async () => {
  await withEnv(UNINSTALL_ENV, async () => {
    assert.equal((await postUninstall({ fetchImpl: recorder(new Response(null, { status: 500 })).fetchImpl })).status, 502);
    assert.equal((await postUninstall({ fetchImpl: async () => { throw new Error("ECONNREFUSED"); } })).status, 502);
  });
  await withEnv({ SHOPIFY_CLIENT_SECRET: SECRET, SHOP_REDACT_FUNCTION_URL: "" }, async () => {
    const fwd = recorder(new Response(null, { status: 200 }));
    assert.equal((await postUninstall({ fetchImpl: fwd.fetchImpl })).status, 503);
    assert.equal(fwd.calls.length, 0);
  });
});
