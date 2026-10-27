import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GET, dynamic } from "../app/api/health/route.ts";

test("GET /api/health -> 200 JSON {ok:true, app:'hq'}", async () => {
  const res = GET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await res.json(), { ok: true, app: "hq" });
  assert.equal(dynamic, "force-dynamic");
});

test("health never hits the DB: the route imports nothing but next/server", () => {
  const src = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.deepEqual([...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["next/server"]);
});
