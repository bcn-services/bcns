/**
 * Owner QuickBooks disconnect (POST /api/oauth/quickbooks/disconnect), asserted
 * without a server or database. The RPC and the worker's Intuit revoke are covered
 * against the local stack in platform/test/quickbooks-disconnect.test.ts; here:
 * the route's guards, the call it makes, and when the card offers the control.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { canDisconnect } from "../lib/sources.ts";

const HUB = "https://connect.bcn-services.com";
const ROUTE = new URL("../app/api/oauth/quickbooks/disconnect/route.ts", import.meta.url);

async function load() {
  Object.assign(process.env, { HUB_BASE_URL: HUB });
  // session.ts wraps loaders in React's server-only cache(); absent outside Next.
  const react = createRequire(import.meta.url)("react");
  react.cache ??= (fn) => fn;
  const { NextRequest } = await import("next/server");
  const { POST } = await import(ROUTE.href);
  return { NextRequest, POST };
}

test("a cross-site POST is refused before any session read", async () => {
  const { NextRequest, POST } = await load();
  for (const headers of [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.example" }]) {
    const res = await POST(new NextRequest(`${HUB}/api/oauth/quickbooks/disconnect`, { method: "POST", headers }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), `${HUB}/?error=disconnect-failed`);
  }
});

test("no owner session (no Supabase session here) is forbidden", async () => {
  const { NextRequest, POST } = await load();
  const res = await POST(
    new NextRequest(`${HUB}/api/oauth/quickbooks/disconnect`, { method: "POST", headers: { "sec-fetch-site": "same-origin" } })
  );
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), `${HUB}/?error=forbidden`);
});

test("route: POST only, cross-site then owner check, then the RPC for quickbooks alone", () => {
  const src = readFileSync(ROUTE, "utf8");
  assert.doesNotMatch(src, /export async function GET/);
  const cross = src.indexOf("isCrossSite(");
  const owner = src.indexOf("ownerSession()");
  const rpc = src.indexOf('rpc("disconnect_source", { p_source: "quickbooks" })');
  assert.ok(cross > -1 && owner > cross && rpc > owner, "guards run in order before the RPC");
  assert.match(src, /\?disconnected=quickbooks/);
  // The hub never touches the token: no source_tokens, no Intuit call.
  assert.doesNotMatch(src, /source_tokens|intuit\.com|fetch\(/);
});

test("canDisconnect: QuickBooks, owner, and something stored", () => {
  assert.equal(canDisconnect({ source: "quickbooks", status: "ok" }, "owner"), true);
  assert.equal(canDisconnect({ source: "quickbooks", status: "never_ran" }, "owner"), true);
  assert.equal(canDisconnect({ source: "quickbooks", status: "auth_failed" }, "owner"), true);
  assert.equal(canDisconnect({ source: "quickbooks", status: "none" }, "owner"), false);
  assert.equal(canDisconnect({ source: "quickbooks", status: "ok" }, "member"), false);
  assert.equal(canDisconnect({ source: "shopify", status: "ok" }, "owner"), false);
});

test("page: the Disconnect control is a two-step <details> confirm posting to the route, no window.confirm", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /canDisconnect\(card, membership\.role\)/);
  assert.match(page, /<details className="disc">\s*<summary>Disconnect<\/summary>/);
  assert.match(page, /action="\/api\/oauth\/quickbooks\/disconnect" method="POST"/);
  assert.match(page, /deletes the QuickBooks data bcns has stored/);
  assert.doesNotMatch(page, /window\.confirm|alert\(/);
});
