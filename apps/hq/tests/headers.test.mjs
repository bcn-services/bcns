/**
 * headers.test.mjs — response security headers (next.config.mjs) and the session cookie flags
 * (lib/cookie-options.ts, wired into lib/supabase.ts, middleware.ts and app/signout/route.ts).
 * The live check is `curl -I http://localhost:3110/login` against `next dev`; see the engineer report.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mod = await import("../next.config.mjs");
const cfg =
  typeof mod.default === "function"
    ? await mod.default("phase-production-server", { defaultConfig: {} })
    : mod.default;
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const rules = await cfg.headers();
const hdr = (rule) => Object.fromEntries(rule.headers.map((h) => [h.key.toLowerCase(), h.value]));

test("next.config headers(): CSP frame-ancestors 'none', nosniff, referrer policy on every page", () => {
  assert.equal(rules.length, 1);
  const h = hdr(rules[0]);
  const csp = h["content-security-policy"];
  assert.match(csp, /(^|; )frame-ancestors 'none'(;|$)/);
  assert.match(csp, /(^|; )default-src 'self'(;|$)/);
  assert.match(csp, /(^|; )object-src 'none'(;|$)/);
  assert.match(csp, /(^|; )base-uri 'self'(;|$)/);
  assert.match(csp, /(^|; )form-action 'self'(;|$)/);
  assert.match(csp, /(^|; )connect-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /\*|https?:/, "no wildcard or foreign origin");
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.equal(h["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(h["x-frame-options"], "DENY");
  assert.match(h["strict-transport-security"], /^max-age=\d{7,}$/);
  assert.doesNotMatch(
    h["strict-transport-security"],
    /includeSubDomains/,
    "sibling subdomains are not ours to pin"
  );
});

test("production CSP has no unsafe-eval; dev (next dev's HMR) does", () => {
  const prod = mod.securityHeaders(false).find((h) => h.key === "Content-Security-Policy").value;
  const dev = mod.securityHeaders(true).find((h) => h.key === "Content-Security-Policy").value;
  assert.doesNotMatch(prod, /unsafe-eval/);
  assert.match(dev, /unsafe-eval/);
});

test("/authorize is excluded (its own CSP names the redirect origin); everything else matches", () => {
  const re = new RegExp(`^${rules[0].source.replace(/^\//, "\\/")}$`);
  for (const p of [
    "/login",
    "/",
    "/work",
    "/mcp",
    "/token",
    "/register",
    "/.well-known/oauth-authorization-server",
    "/authorize/x",
  ])
    assert.match(p, re, p);
  assert.doesNotMatch("/authorize", re);
});

test("session cookie flags: HttpOnly, SameSite=Lax, Secure in production, host-only", async () => {
  const { sessionCookieOptions, hardenCookie } = await import("../lib/cookie-options.ts");
  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.deepEqual(sessionCookieOptions(), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    process.env.NODE_ENV = "development";
    assert.equal(sessionCookieOptions().secure, false, "http://localhost dev still signs in");
    process.env.NODE_ENV = "production";
    // whatever @supabase/ssr hands setAll (httpOnly:false by default) cannot loosen the flags
    const o = hardenCookie({
      httpOnly: false,
      sameSite: "none",
      secure: false,
      maxAge: 5,
      domain: undefined,
    });
    assert.equal(o.httpOnly, true);
    assert.equal(o.sameSite, "lax");
    assert.equal(o.secure, true);
    assert.equal(o.maxAge, 5, "other options pass through");
    assert.equal("domain" in sessionCookieOptions(), false);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("every place that writes the session cookie uses the hardened options", () => {
  for (const f of ["lib/supabase.ts", "middleware.ts"]) {
    const s = src(f);
    assert.match(s, /cookieOptions: sessionCookieOptions\(\)/, f);
    assert.match(s, /hardenCookie\(options\)/, f);
    assert.doesNotMatch(s, /domain\s*:/, `${f}: host-only`);
  }
  assert.match(src("app/signout/route.ts"), /res\.cookies\.set\(c\.name, "", hardenCookie\(/);
});
