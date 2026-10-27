/**
 * redirect-origin.test.mjs — behind nginx the standalone server reports request.url as the INTERNAL
 * origin (https://localhost:3105/...) while Host is the public name. A redirect built from nextUrl
 * then sends the browser to its own localhost (packages/tenant/src/middleware.ts documents the same
 * trap). Every HQ redirect must land on the public origin: relative, or built from Host.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

globalThis.AsyncLocalStorage = AsyncLocalStorage;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://hq-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";

const { NextRequest } = await import("next/server");
const { gate } = await import("../lib/gate.ts");
const { POST: signOut } = await import("../app/signout/route.ts");
const { requestAsyncStorage } =
  await import("next/dist/client/components/request-async-storage.external.js");

const PUBLIC = "https://hq.bcn-services.com";
/** What nginx forwards to `node server.js`: internal URL, public Host. */
const proxied = (path, method = "GET") =>
  new NextRequest(`https://localhost:3105${path}`, {
    method,
    headers: { host: "hq.bcn-services.com", "x-forwarded-proto": "https" },
  });
/** Where the browser (which asked for PUBLIC) ends up after following Location. */
const lands = (res) => new URL(res.headers.get("location"), PUBLIC);

test("gate deny (GET, no session) redirects to /login on the public origin, not the internal one", async () => {
  const res = await gate(proxied("/leads"), async () => null);
  assert.equal(res.status, 307);
  assert.equal(lands(res).origin, PUBLIC, `Location was ${res.headers.get("location")}`);
  assert.equal(lands(res).pathname, "/login");
});

test("gate deny (non-GET) redirects 303 to /login on the public origin", async () => {
  const res = await gate(proxied("/leads", "POST"), async () => null);
  assert.equal(res.status, 303);
  assert.equal(lands(res).origin, PUBLIC, `Location was ${res.headers.get("location")}`);
  assert.equal(lands(res).pathname, "/login");
});

test("POST /signout redirects 303 to /login on the public origin", async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  const request = proxied("/signout", "POST");
  const jar = new Map();
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value) => void jar.set(name, value),
  };
  const res = await requestAsyncStorage.run(
    { cookies, mutableCookies: cookies, headers: new Headers() },
    () => signOut(request)
  );
  assert.equal(res.status, 303);
  assert.equal(lands(res).origin, PUBLIC, `Location was ${res.headers.get("location")}`);
  assert.equal(lands(res).pathname, "/login");
});
