/** gate-catch.test.mjs — gate() itself fails closed when the injected check throws or returns null. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

const { gate } = await import("../lib/gate.ts");
const req = (path) => new NextRequest(`http://localhost:3105${path}`);

test("gate: a check that THROWS is denied (307 /login), never admitted", async () => {
  const res = await gate(req("/leads"), async () => {
    throw new Error("boom");
  });
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location"), "http://localhost").pathname, "/login");
});

test("gate: a check returning null is denied; a response is passed through; public paths skip the check", async () => {
  assert.equal((await gate(req("/"), async () => null)).status, 307);
  const next = NextResponse.next();
  assert.equal(await gate(req("/"), async () => ({ ok: true, response: next })), next);
  let called = false;
  await gate(req("/login"), async () => ((called = true), null));
  assert.equal(called, false);
});

test("gate: a denied check's Set-Cookie (refreshed session) is carried onto the redirect", async () => {
  const response = NextResponse.next();
  response.cookies.set("sb-x-auth-token", "rotated", { path: "/", httpOnly: true });
  const res = await gate(req("/leads"), async () => ({ ok: false, response }));
  assert.equal(res.status, 307);
  const set = res.headers.getSetCookie();
  assert.equal(set.length, 1);
  assert.match(set[0], /^sb-x-auth-token=rotated; Path=\/; HttpOnly/);
});
