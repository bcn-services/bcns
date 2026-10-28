/**
 * mcp-routes.test.mjs — the Next route handlers end to end (authorize -> token -> /mcp -> refresh) with
 * GoTrue stubbed at the fetch seam and a fake Supabase client behind /mcp. No network, no Next.
 * Asserts the hard requirement: the client only ever holds HQ-issued opaque tokens; the Supabase JWT
 * and refresh token never appear in any response.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createOAuth, newState, realRandomBytes, supabaseSessionDeps } from "../lib/mcp/oauth.ts";
import { createRateLimiter } from "../lib/mcp/limit.ts";
import { memberFor } from "../lib/mcp/auth.ts";
import * as mcp from "../app/mcp/route.ts";
import * as authorize from "../app/authorize/route.ts";
import * as token from "../app/token/route.ts";
import * as register from "../app/register/route.ts";
import * as asMeta from "../app/.well-known/oauth-authorization-server/route.ts";
import * as prm from "../app/.well-known/oauth-protected-resource/route.ts";
import * as prmMcp from "../app/.well-known/oauth-protected-resource/mcp/route.ts";
import { mcpFake } from "./_mcp-fake.mjs";

delete process.env.HQ_PUBLIC_ORIGIN;
const ISS = "https://hq.bcn-services.com";
const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const SB_JWT = `h.${Buffer.from(JSON.stringify({ sub: "user-1" })).toString("base64url")}.s`;
const SB_REFRESH = "sb-refresh-secret";
const VERIFIER = "v".repeat(43);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const T_NATE = "33333333-3333-4333-8333-333333333331";
const T_CLAUDE = "33333333-3333-4333-8333-333333333332";

/** Seeds the process-wide runtime the routes read. Returns the fakes. */
function boot({ limit = 1000 } = {}) {
  const gotrue = [];
  const fetchStub = async (url, init) => {
    gotrue.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify({ access_token: SB_JWT, refresh_token: SB_REFRESH, expires_in: 3600 }),
      { status: 200 }
    );
  };
  const fake = mcpFake({
    tasks: [
      {
        id: T_NATE,
        title: "send quote",
        owner: "nate",
        status: "todo",
        area: "ops",
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        id: T_CLAUDE,
        title: "draft notes",
        owner: "claude",
        status: "todo",
        area: "ops",
        created_at: "2026-09-02T00:00:00Z",
      },
    ],
    events: [],
  });
  const clientJwts = [];
  const unlimited = { allow: () => true };
  const oauth = createOAuth(
    {
      ...supabaseSessionDeps(
        { url: "https://sb.example.test", anonKey: "anon.jwt.key" },
        { fetch: fetchStub, log: () => {} }
      ),
      member: async () => ({ id: "11111111-1111-4111-8111-111111111111", handle: "nate" }),
      now: () => Date.now(),
      randomBytes: realRandomBytes,
      allowLogin: () => true,
      allowSignInUpstream: () => true,
      allowSignInIp: () => true,
      allowRefreshUpstream: () => true,
      allowKnownIpRefresh: () => true,
      allowUnknownIpRefresh: () => true,
      allowUnknownRefresh: () => true,
    },
    newState()
  );
  globalThis.__hqMcp = {
    oauth,
    limiter: limit === 1000 ? unlimited : createRateLimiter(limit),
    client: (jwt) => (clientJwts.push(jwt), fake),
  };
  return { gotrue, fake, clientJwts };
}

const FORM = { "content-type": "application/x-www-form-urlencoded" };
const seen = []; // every response body + header block the client could see
async function see(res) {
  const body = await res.clone().text();
  seen.push(body, JSON.stringify([...res.headers]));
  return res;
}
async function connect() {
  const reg = await register.POST(
    new Request(`${ISS}/register`, {
      method: "POST",
      body: JSON.stringify({ redirect_uris: [CLAUDE] }),
    })
  );
  const { client_id } = await (await see(reg)).json();
  const params = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: CLAUDE,
    state: "s",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: `${ISS}/mcp`,
    email: "owner@example.test",
    password: "pw",
  });
  const page = await see(await authorize.GET(new Request(`${ISS}/authorize?${params}`)));
  assert.equal(page.status, 200);
  const red = await see(
    await authorize.POST(
      new Request(`${ISS}/authorize`, {
        method: "POST",
        headers: { ...FORM, origin: ISS },
        body: params.toString(),
      })
    )
  );
  assert.equal(red.status, 302);
  const code = new URL(red.headers.get("location")).searchParams.get("code");
  const tok = await see(
    await token.POST(
      new Request(`${ISS}/token`, {
        method: "POST",
        headers: FORM,
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: CLAUDE,
          client_id,
          code_verifier: VERIFIER,
        }).toString(),
      })
    )
  );
  assert.equal(tok.status, 200);
  return tok.json();
}
const rpc = (bearer, method, params, extra = {}) =>
  new Request(`${ISS}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...extra,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
const callTool = async (bearer, name, args) => {
  const res = await see(await mcp.POST(rpc(bearer, "tools/call", { name, arguments: args })));
  assert.equal(res.status, 200);
  return (await res.json()).result;
};

test("POST /mcp without a usable token is 401 with the resource_metadata challenge", async () => {
  boot();
  const want = `Bearer resource_metadata="${ISS}/.well-known/oauth-protected-resource/mcp"`;
  for (const bearer of [undefined, "", "not-a-token", SB_JWT]) {
    const res = await mcp.POST(rpc(bearer, "tools/list"));
    assert.equal(res.status, 401, String(bearer));
    assert.equal(res.headers.get("www-authenticate"), want);
  }
  const basic = await mcp.POST(
    rpc(undefined, "tools/list", undefined, { authorization: "Basic abc" })
  );
  assert.equal(basic.status, 401);
});

test("GET and DELETE /mcp are 405 (POST only)", async () => {
  boot();
  for (const handler of [mcp.GET, mcp.DELETE]) {
    const res = await handler(new Request(`${ISS}/mcp`));
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
  }
  assert.equal(mcp.PUT, undefined);
  assert.equal(mcp.dynamic, "force-dynamic");
  assert.equal(mcp.runtime, "nodejs");
});

test("well-known metadata names the configured origin even when the request Host differs", async () => {
  boot();
  const evil = (path) =>
    new Request(`https://evil.example.test${path}`, {
      headers: { host: "evil.example.test", "x-forwarded-host": "evil.example.test" },
    });
  const as = await asMeta.GET(evil("/.well-known/oauth-authorization-server"));
  const j = await as.json();
  assert.equal(j.issuer, "https://hq.bcn-services.com");
  for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint"])
    assert.ok(j[k].startsWith("https://hq.bcn-services.com/"), k);
  for (const h of [prm, prmMcp]) {
    const p = await (await h.GET(evil("/.well-known/oauth-protected-resource"))).json();
    assert.deepEqual(p, {
      resource: "https://hq.bcn-services.com/mcp",
      authorization_servers: ["https://hq.bcn-services.com"],
    });
  }
  assert.ok(!JSON.stringify(j).includes("evil"));
});

test("end to end: the client holds only opaque tokens; the Supabase JWT never reaches it", async () => {
  const { gotrue, clientJwts } = boot();
  const pair = await connect();
  for (const tok of [pair.access_token, pair.refresh_token]) {
    assert.match(tok, /^[A-Za-z0-9_-]{43}$/);
    assert.ok((tok.match(/\./g) ?? []).length < 2, "not a JWT");
    assert.throws(
      () => JSON.parse(Buffer.from(tok, "base64url").toString("utf8")),
      "not base64 JSON"
    );
  }
  assert.deepEqual(
    gotrue.map((g) => g.url.split("grant_type=")[1]),
    ["password"]
  );

  const list = await see(await mcp.POST(rpc(pair.access_token, "tools/list")));
  assert.equal(list.status, 200);
  const names = (await list.json()).result.tools.map((t) => t.name).sort();
  assert.equal(names.length, 13);
  assert.ok(
    names.includes("propose_lead_stage") && !names.some((n) => /approve|decide|delete/.test(n))
  );

  // update_task -> done: refused for nate's task, allowed for claude's, through the real transport
  const refused = await callTool(pair.access_token, "update_task", { id: T_NATE, status: "done" });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /refused: this task is owned by nate/);
  const done = await callTool(pair.access_token, "update_task", { id: T_CLAUDE, status: "done" });
  assert.equal(done.isError, undefined);
  assert.match(done.content[0].text, /untrusted_data/);

  // the Supabase JWT only ever went to the Supabase client
  assert.ok(clientJwts.length >= 3 && clientJwts.every((j) => j === SB_JWT));

  // refresh: GoTrue gets the STORED Supabase refresh token, the client gets a new opaque pair, the old pair dies
  const ref = await see(
    await token.POST(
      new Request(`${ISS}/token`, {
        method: "POST",
        headers: FORM,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: pair.refresh_token,
        }).toString(),
      })
    )
  );
  assert.equal(ref.status, 200);
  const next = await ref.json();
  assert.deepEqual(gotrue[1].body, { refresh_token: SB_REFRESH });
  assert.notEqual(next.access_token, pair.access_token);
  assert.equal(
    (await mcp.POST(rpc(pair.access_token, "tools/list"))).status,
    401,
    "old access token is dead"
  );
  assert.equal((await mcp.POST(rpc(next.access_token, "tools/list"))).status, 200);
  const reuse = await token.POST(
    new Request(`${ISS}/token`, {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: pair.refresh_token,
      }).toString(),
    })
  );
  assert.equal((await reuse.json()).error, "invalid_grant");

  const everything = seen.join("\n");
  assert.ok(!everything.includes(SB_JWT), "the Supabase JWT never appears in a response");
  assert.ok(
    !everything.includes(SB_REFRESH),
    "the Supabase refresh token never appears in a response"
  );
});

test("/mcp: a foreign Origin is 403 before the token is looked at, claude.ai is accepted", async () => {
  boot();
  const { access_token } = await connect();
  assert.equal(
    (
      await mcp.POST(
        rpc(access_token, "tools/list", undefined, { origin: "https://evil.example.test" })
      )
    ).status,
    403
  );
  assert.equal(
    (await mcp.POST(rpc(access_token, "tools/list", undefined, { origin: "https://claude.ai" })))
      .status,
    200
  );
});

test("/mcp: bad JSON is 400, an oversized body is 413, and the per-token rate limit is 429", async () => {
  boot({ limit: 3 });
  const { access_token } = await connect();
  const raw = (body, headers = {}) =>
    new Request(`${ISS}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${access_token}`,
        ...headers,
      },
      body,
    });
  assert.equal((await mcp.POST(raw("{nope"))).status, 400);
  assert.equal((await mcp.POST(raw("x".repeat(1024 * 1024 + 1)))).status, 413);
  assert.equal((await mcp.POST(raw("{}"))).status !== 429, true);
  const limited = await mcp.POST(raw("{}"));
  assert.equal(limited.status, 429);
});

test("memberFor: a Supabase error throws (sign-in answers 503); only a clean empty result is 'no membership'", async () => {
  const env = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const saved = [...env.map((k) => process.env[k]), globalThis.fetch];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://sb.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  const answer = (status, body) => async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  try {
    globalThis.fetch = answer(500, { message: "boom" });
    await assert.rejects(memberFor(SB_JWT), /profiles read/);
    globalThis.fetch = answer(200, null);
    assert.equal(await memberFor(SB_JWT), null);
    globalThis.fetch = answer(200, { id: "user-1", handle: "nate" });
    assert.deepEqual(await memberFor(SB_JWT), { id: "user-1", handle: "nate" });
  } finally {
    env.forEach((k, i) =>
      saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])
    );
    globalThis.fetch = saved[env.length];
  }
});
