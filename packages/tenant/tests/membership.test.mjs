/**
 * membership.test.mjs — claim extraction and the four requireMembership
 * outcomes, against a stubbed Supabase client. No network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { membershipFromUser, requireMembership } from "../src/membership.ts";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OTHER_CLIENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

/** A token shaped like the one custom_access_token_hook mints. */
function accessToken(claims) {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `header.${payload}.signature`;
}

/** Minimal stand-in for the bits of SupabaseClient requireMembership touches. */
function stubClient({ user = null, token = undefined } = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : new Error("no session") }),
      getSession: async () => ({
        data: { session: token ? { access_token: token } : null },
        error: null,
      }),
    },
  };
}

test("membershipFromUser: top-level claims (where the access token hook writes them)", () => {
  assert.deepEqual(
    membershipFromUser({
      id: USER_ID,
      email: "owner@example.com",
      client_id: CLIENT_ID,
      client_role: "owner",
    }),
    { userId: USER_ID, email: "owner@example.com", clientId: CLIENT_ID, role: "owner" }
  );
});

test("membershipFromUser: app_metadata fallback, and sub in place of id", () => {
  assert.deepEqual(
    membershipFromUser({
      sub: USER_ID,
      app_metadata: { client_id: CLIENT_ID, client_role: "member" },
    }),
    { userId: USER_ID, email: null, clientId: CLIENT_ID, role: "member" }
  );
});

test("membershipFromUser: null whenever a claim is missing or the role is not a member_role", () => {
  assert.equal(membershipFromUser(null), null);
  assert.equal(membershipFromUser({ id: USER_ID, client_role: "owner" }), null, "no client_id");
  assert.equal(membershipFromUser({ id: USER_ID, client_id: CLIENT_ID }), null, "no role");
  assert.equal(membershipFromUser({ client_id: CLIENT_ID, client_role: "owner" }), null, "no id");
  assert.equal(
    membershipFromUser({ id: USER_ID, client_id: CLIENT_ID, client_role: "admin" }),
    null,
    "role outside data.member_role"
  );
  assert.equal(
    membershipFromUser({ id: USER_ID, client_id: "", client_role: "owner" }),
    null,
    "empty client_id"
  );
});

test("membershipFromUser: a bare getUser() user carries no claims and denies", () => {
  // The hook's claims live in the token, not in GoTrue's /user response.
  assert.equal(
    membershipFromUser({ id: USER_ID, email: "a@b.com", app_metadata: { provider: "email" } }),
    null
  );
});

test("requireMembership: signed out", async () => {
  assert.deepEqual(await requireMembership(stubClient()), { ok: false, reason: "signed-out" });
});

test("requireMembership: signed in, no client claim on the token", async () => {
  const result = await requireMembership(
    stubClient({ user: { id: USER_ID }, token: accessToken({ sub: USER_ID }) })
  );
  assert.deepEqual(result, { ok: false, reason: "no-membership" });
});

test("requireMembership: signed in with a membership, unpinned app", async () => {
  const result = await requireMembership(
    stubClient({
      user: { id: USER_ID, email: "owner@example.com" },
      token: accessToken({ sub: USER_ID, client_id: CLIENT_ID, client_role: "owner" }),
    })
  );
  assert.deepEqual(result, {
    ok: true,
    membership: {
      userId: USER_ID,
      email: "owner@example.com",
      clientId: CLIENT_ID,
      role: "owner",
    },
  });
});

test("requireMembership: pinned app accepts its own client and rejects another", async () => {
  const client = stubClient({
    user: { id: USER_ID, email: "member@example.com" },
    token: accessToken({ sub: USER_ID, client_id: CLIENT_ID, client_role: "member" }),
  });
  assert.equal((await requireMembership(client, { expectedClientId: CLIENT_ID })).ok, true);
  assert.deepEqual(await requireMembership(client, { expectedClientId: OTHER_CLIENT_ID }), {
    ok: false,
    reason: "wrong-client",
  });
});

test("requireMembership: a malformed token denies rather than allows", async () => {
  for (const token of ["not-a-jwt", "a.!!!!.c", ""]) {
    const result = await requireMembership(stubClient({ user: { id: USER_ID }, token }));
    assert.deepEqual(result, { ok: false, reason: "no-membership" }, token);
  }
});

test("requireMembership: user claims never override the verified token's client", async () => {
  // A user record that claims another tenant must not beat the signed token.
  const result = await requireMembership(
    stubClient({
      user: { id: USER_ID, client_id: OTHER_CLIENT_ID, client_role: "owner" },
      token: accessToken({ sub: USER_ID, client_id: CLIENT_ID, client_role: "member" }),
    }),
    { expectedClientId: CLIENT_ID }
  );
  assert.equal(result.ok, true);
  assert.equal(result.membership.clientId, CLIENT_ID);
  assert.equal(result.membership.role, "member");
});
