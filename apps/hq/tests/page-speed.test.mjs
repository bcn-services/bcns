/** page-speed.test.mjs — fewer DB round trips per page: trades cache, parallel chunks, middleware-forwarded session. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const L = await import("../lib/leads.ts");
const D = await import("../lib/deliverables.ts");
const { gate } = await import("../lib/gate.ts");
const { SESSION_HEADER, encodeSession, decodeSession } = await import("../lib/session-header.ts");

test("loadTrades: one scan per hour, shared by concurrent callers; a failed scan is retried", async () => {
  let scans = 0;
  let fail = true;
  const sb = {
    from: () => {
      const b = {
        select: () => b,
        is: () => b,
        not: () => b,
        order: () => b,
        range: async () => (
          scans++,
          fail
            ? { data: null, error: { message: "down" } }
            : { data: [{ trade: "roofing" }], error: null }
        ),
      };
      return b;
    },
  };
  const t0 = 1_000_000_000_000;
  assert.equal((await L.loadTrades(sb, t0)).error, "down");
  fail = false;
  const [a, b] = await Promise.all([L.loadTrades(sb, t0 + 1), L.loadTrades(sb, t0 + 1)]);
  assert.deepEqual(a.trades, ["roofing"]);
  assert.deepEqual(b.trades, ["roofing"]);
  assert.equal(scans, 2, "the failure was not cached; the two concurrent callers shared one scan");
  a.trades.push("mutated"); // the page unshifts into its copy
  assert.deepEqual((await L.loadTrades(sb, t0 + 3_599_000)).trades, ["roofing"]);
  assert.equal(scans, 2, "hit inside the hour: no query");
  await L.loadTrades(sb, t0 + 3_600_001);
  assert.equal(scans, 3, "expired: rescanned");
});

// a client whose queries all stay open until `release()`, so chunks only overlap if they were started together
function gated() {
  let open = 0;
  let max = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const sb = {
    from: () => {
      const b = {
        select: () => b,
        in: () => b,
        order: () => b,
        then: (ok) => (
          open++,
          (max = Math.max(max, open)),
          gate.then(() => ok({ data: [], error: null }))
        ),
      };
      return b;
    },
  };
  return { sb, release: () => release(), seen: () => max };
}

test("loadExtras and loadDeliverables start every 100-id chunk at once", async () => {
  const e = gated();
  const p = L.loadExtras(
    e.sb,
    Array.from({ length: 250 }, (_, i) => `id${i}`)
  );
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(e.seen(), 9, "3 chunks x 3 queries in flight together");
  e.release();
  await p;
  const d = gated();
  const q = D.loadDeliverables(
    d.sb,
    Array.from({ length: 250 }, (_, i) => `s${i}`)
  );
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(d.seen(), 3);
  d.release();
  await q;
});

test("session header round-trips (incl. non-Latin-1 names); malformed or incomplete values are ignored", () => {
  const s = {
    user: { id: "u1", email: "a@b.c" },
    profile: { id: "u1", handle: "nate", role: "admin", display_name: "Zoë ✓" },
  };
  assert.deepEqual(decodeSession(encodeSession(s)), s);
  for (const bad of [
    null,
    "",
    "not json",
    encodeURIComponent("{}"),
    encodeURIComponent(JSON.stringify({ user: { id: "x" }, profile: null })),
  ])
    assert.equal(decodeSession(bad), null, String(bad));
});

test("gate: a client-sent session header is dropped on public paths", async () => {
  const req = new NextRequest("http://localhost:3105/login", {
    headers: { [SESSION_HEADER]: "forged" },
  });
  const res = await gate(req, async () => null);
  assert.equal(res.headers.get("x-middleware-request-" + SESSION_HEADER), null);
  assert.ok(
    ![...res.headers.keys()].some(
      (k) => k === "x-middleware-override-headers" && res.headers.get(k).includes(SESSION_HEADER)
    )
  );
});

test("an admitted request carries the validated session, not a forged one, plus the refreshed cookies", async () => {
  const { NextResponse } = await import("next/server");
  const real = {
    user: { id: "u1" },
    profile: { id: "u1", handle: "nate", role: "admin", display_name: null },
  };
  const check = async (request) => {
    const response = NextResponse.next({ request });
    response.cookies.set("sb-x-auth-token", "rotated", { path: "/", httpOnly: true });
    const forwarded = new Headers(request.headers);
    forwarded.set(SESSION_HEADER, encodeSession(real)); // the same lines as middleware.ts
    const admitted = NextResponse.next({ request: { headers: forwarded } });
    response.cookies.getAll().forEach((c) => admitted.cookies.set(c));
    return { ok: true, response: admitted };
  };
  const req = new NextRequest("http://localhost:3105/leads", {
    headers: { [SESSION_HEADER]: encodeSession({ ...real, user: { id: "evil" } }) },
  });
  const res = await gate(req, check);
  assert.deepEqual(decodeSession(res.headers.get("x-middleware-request-" + SESSION_HEADER)), real);
  assert.match(res.headers.getSetCookie()[0], /^sb-x-auth-token=rotated; Path=\/; HttpOnly/);
});

test("getSession reads the middleware header before asking Supabase; the files route does not", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../lib/session.ts"), /getSession = cache\(\s*async \(\) => decodeSession\(/);
  assert.match(read("../app/files/[...path]/route.ts"), /getVerifiedSession\(\)/);
  assert.match(read("../middleware.ts"), /forwarded\.set\(\s*SESSION_HEADER/);
});

test("loadTrades: an empty scan (RLS hiding every row) is not kept", async () => {
  let rows = [];
  const sb = {
    from: () => {
      const b = {
        select: () => b,
        is: () => b,
        not: () => b,
        order: () => b,
        range: async () => ({ data: rows, error: null }),
      };
      return b;
    },
  };
  const t0 = 2_000_000_000_000; // past the 1 h window of the earlier test's entry
  assert.deepEqual((await L.loadTrades(sb, t0)).trades, []);
  rows = [{ trade: "plumbing" }];
  assert.deepEqual((await L.loadTrades(sb, t0 + 1)).trades, ["plumbing"]);
});
