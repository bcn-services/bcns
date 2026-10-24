import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import config from "../next.config.mjs";

// Next compiles header sources with this exact function (regex it matches requests against).
const { buildCustomRoute } = createRequire(import.meta.url)("next/dist/lib/build-custom-route");

const EXPECTED = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy-Report-Only":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'none'; base-uri 'self'",
};

test("security headers rule", async () => {
  const rules = await config.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, "/:path*");
  const got = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
  assert.deepEqual(got, EXPECTED);
  assert.ok(!("Content-Security-Policy" in got), "CSP stays report-only");
});

test("source matching", async () => {
  const [rule] = await config.headers();
  const re = new RegExp(buildCustomRoute("header", rule).regex, "i");
  for (const p of ["/", "/login", "/signup", "/sources/x"]) assert.ok(re.test(p), p);
  assert.ok(re.test("/api/health"));
});
