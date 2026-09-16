/**
 * tenant-pin.test.mjs — the tenant pin fails CLOSED.
 *
 * `middleware.ts` can't be imported under node (Next edge module), so the
 * decision lives in the pure `pinOrDeny(env)` in lib/env.ts and the middleware
 * only routes its three outcomes. This tests the decision.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pinOrDeny } from "../lib/env.ts";

const URL_SET = "https://platform.supabase.co";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

test("platform configured, EXPECTED_CLIENT_ID unset: DENY (never an unpinned app)", () => {
  for (const clientId of [undefined, "", "   "]) {
    assert.deepEqual(
      pinOrDeny({ NEXT_PUBLIC_SUPABASE_URL: URL_SET, EXPECTED_CLIENT_ID: clientId }),
      { kind: "deny" },
      `EXPECTED_CLIENT_ID=${JSON.stringify(clientId)} must not silently unpin the app`
    );
  }
});

test("no platform env: skip, so local dev without the platform still serves", () => {
  for (const url of [undefined, "", "  "]) {
    assert.deepEqual(pinOrDeny({ NEXT_PUBLIC_SUPABASE_URL: url }), { kind: "skip" });
    assert.deepEqual(pinOrDeny({ NEXT_PUBLIC_SUPABASE_URL: url, EXPECTED_CLIENT_ID: CLIENT_ID }), {
      kind: "skip",
    });
  }
});

test("both set: pin to that client, trimmed", () => {
  assert.deepEqual(
    pinOrDeny({ NEXT_PUBLIC_SUPABASE_URL: URL_SET, EXPECTED_CLIENT_ID: ` ${CLIENT_ID}\n` }),
    { kind: "pin", clientId: CLIENT_ID }
  );
});

test("middleware.ts routes deny to a denial, not to an unpinned tenantMiddleware", () => {
  // Read as text: the file is an edge module. Guards the wiring, not the logic.
  const src = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(src, /pinOrDeny/, "middleware must consult pinOrDeny");
  assert.match(src, /error=misconfigured/, "deny must send the browser to the login error");
  assert.match(src, /status:\s*500/, "deny must 500 for /api/* callers");
});
