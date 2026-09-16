/**
 * RLS forbidden-read scaffold + R39 smoke (platform-v1 REQUIREMENTS.md).
 *
 * R39: "Dashboard CI logs in as the client's smoke user and asserts it reads
 * only its own rows." Two probes, both SKIP without their required env —
 * never fail on a keyless run.
 *
 * Client builds MUST extend this file with one forbidden-read attempt per
 * additional protected table/role as the schema grows.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "@bcn-services/data-client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const healthEmail = process.env.HEALTH_EMAIL?.trim();
const healthPassword = process.env.HEALTH_PASSWORD?.trim();
const expectedClientId = process.env.EXPECTED_CLIENT_ID?.trim();

test(
  "rls: anon key cannot read arbitrary tables without a policy",
  { skip: !(url && anonKey) && "Supabase env not configured — live RLS probe skipped" },
  async () => {
    // Probe a table name the schema should never expose publicly. With RLS on
    // and no anon policy, PostgREST answers with an error or an empty set —
    // never rows.
    const res = await fetch(`${url}/rest/v1/protected_probe?select=*`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (res.ok) {
      const rows = await res.json();
      assert.deepEqual(rows, [], "anon must never receive rows from an unpoliced table");
    } else {
      assert.ok(res.status >= 400, "non-ok responses must be denials");
    }
  },
);

/** client_id claim from an authenticated JWT (decode-only — the server already
 *  verified this token; a test has no signing key to re-verify it with). */
function clientIdFromToken(accessToken) {
  const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
  if (typeof claims.client_id !== "string") throw new Error("access token has no client_id claim");
  return claims.client_id;
}

test(
  "rls (R39): the signed-in smoke user reads only its own client's rows via memberships_v1",
  {
    skip:
      !(url && anonKey && healthEmail && healthPassword) &&
      "Supabase env / HEALTH_EMAIL / HEALTH_PASSWORD not configured — live R39 smoke skipped",
  },
  async () => {
    const client = await signIn({ supabaseUrl: url, anonKey, email: healthEmail, password: healthPassword });
    const ownClientId = clientIdFromToken(await client.accessToken());

    // Cheapest *_v1 view: memberships_v1 is a small per-client row set.
    const { data: rows, error } = await client.views.memberships_v1();
    assert.equal(error, null, `memberships_v1 read failed: ${error?.message}`);

    // Robust to zero rows other than the smoke user's own membership — never
    // assumes seed data beyond the account this test signs in as.
    for (const row of rows ?? []) {
      assert.equal(row.client_id, ownClientId, "row leaked another client's data");
      if (expectedClientId) {
        assert.equal(row.client_id, expectedClientId, "row does not match the pinned EXPECTED_CLIENT_ID");
      }
    }
  },
);
