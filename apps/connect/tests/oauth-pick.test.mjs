/**
 * W5b fixes for Meta + Monday: the account/board picker (#1), POST-only
 * same-origin /start and /pick (#3), and the state cookie's lifetime. Run
 * against the real routes with no Supabase env, so a session read yields
 * "forbidden": reaching it proves every earlier guard passed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  PICK_TTL_MS, STATE_TTL_MS, chooseOption, isCrossSite, openPick, pickCookie, pickPath, sealPick,
} from "../lib/oauth-state.ts";

const HUB = "https://connect.bcn-services.com";
const CLIENT = "11111111-2222-3333-4444-555555555555";
const SECRETS = { meta: "meta_pick_secret", monday: "monday_pick_secret" };

Object.assign(process.env, {
  META_CLIENT_ID: "fid", META_CLIENT_SECRET: SECRETS.meta,
  MONDAY_CLIENT_ID: "mid", MONDAY_CLIENT_SECRET: SECRETS.monday,
  OAUTH_APPROVED_SOURCES: "meta,monday", HUB_BASE_URL: HUB,
});
// session.ts wraps loaders in React's server-only cache(); absent outside Next.
const react = createRequire(import.meta.url)("react");
react.cache ??= (fn) => fn;
const { NextRequest } = await import("next/server");
const { bindOrPick, pickGET, pickPOST } = await import("../lib/oauth-connect.ts");
const { getConfig } = await import("../lib/env.ts");

const OPTIONS = {
  meta: [{ id: "act_111", name: "Main" }, { id: "act_222", name: "Second" }],
  monday: [{ id: "42", name: "Ops" }, { id: "43", name: "Sales" }],
};
const handoff = (src, options = OPTIONS[src]) => ({ clientId: CLIENT, accessToken: `TOKEN_${src}`, expiresAt: null, options });

/* ------------------------------------------------------------ pure guards */

test("sealed pick round-trips, and refuses tamper, expiry, the other source's key and garbage", () => {
  const sealed = sealPick(handoff("meta"), SECRETS.meta, "meta", 1_000);
  assert.deepEqual(openPick(sealed, SECRETS.meta, "meta", 1_000), { ok: true, pick: { ...handoff("meta"), exp: 1_000 + PICK_TTL_MS } });
  assert.equal(openPick(sealed, SECRETS.meta, "meta", 1_000 + PICK_TTL_MS + 1).reason, "expired");
  assert.equal(openPick(sealed, "other", "meta", 1_000).reason, "malformed");
  assert.equal(openPick(sealed, SECRETS.meta, "monday", 1_000).reason, "malformed"); // label-separated
  const raw = Buffer.from(sealed, "base64url");
  raw[raw.length - 1] ^= 1;
  assert.equal(openPick(raw.toString("base64url"), SECRETS.meta, "meta", 1_000).reason, "malformed");
  for (const bad of [null, "", "abc", "x".repeat(80)]) assert.equal(openPick(bad, SECRETS.meta, "meta").ok, false);
  assert.doesNotMatch(Buffer.from(sealed, "base64url").toString("latin1"), /TOKEN_meta|act_111/);
});

test("chooseOption returns only an id the provider listed", () => {
  const opts = OPTIONS.meta;
  assert.equal(chooseOption(opts, "act_222"), "act_222");
  for (const bad of ["act_999", "act_22", "act_2222", " act_222", "", null, undefined, ["act_222"], 222]) {
    assert.equal(chooseOption(opts, bad), null, String(bad));
  }
  assert.equal(chooseOption([], "act_111"), null);
});

test("isCrossSite: Sec-Fetch-Site other than same-origin, or a foreign Origin, is cross-site", () => {
  const h = (o) => new Headers(o);
  assert.equal(isCrossSite(h({ "sec-fetch-site": "same-origin", origin: HUB }), HUB), false);
  assert.equal(isCrossSite(h({ origin: HUB }), HUB), false);
  assert.equal(isCrossSite(h({}), HUB), false); // no browser, no victim cookie
  assert.equal(isCrossSite(h({ "sec-fetch-site": "cross-site" }), HUB), true);
  assert.equal(isCrossSite(h({ "sec-fetch-site": "same-site" }), HUB), true);
  assert.equal(isCrossSite(h({ origin: "https://evil.example" }), HUB), true);
  assert.equal(isCrossSite(h({ origin: "null" }), HUB), true);
  assert.equal(isCrossSite(h({ "sec-fetch-site": "same-origin", origin: "https://evil.example" }), HUB), true);
});

/* ---------------------------------------------------------------- /start */

for (const src of ["meta", "monday"]) {
  test(`${src} /start is POST-only and refuses a cross-site request before the session`, async () => {
    const mod = await import(`../app/api/oauth/${src}/start/route.ts`);
    assert.equal(mod.GET, undefined, "no GET: a link or <img> cannot start a reconnect");
    const url = `${HUB}/api/oauth/${src}/start`;
    const cross = await mod.POST(new Request(url, { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
    assert.equal(cross.status, 303);
    assert.equal(cross.headers.get("location"), `${HUB}/?error=connect-failed`);
    const foreign = await mod.POST(new Request(url, { method: "POST", headers: { origin: "https://evil.example" } }));
    assert.equal(foreign.headers.get("location"), `${HUB}/?error=connect-failed`);
    // Same-origin gets past the check to the owner session (none here).
    const same = await mod.POST(new Request(url, { method: "POST", headers: { "sec-fetch-site": "same-origin", origin: HUB } }));
    assert.equal(same.headers.get("location"), `${HUB}/?error=forbidden`);
  });
}

test("the state cookie lives exactly as long as the state", () => {
  const src = readFileSync(new URL("../lib/oauth-connect.ts", import.meta.url), "utf8");
  assert.match(src, /maxAge:\s*STATE_TTL_MS \/ 1000/);
  assert.equal(STATE_TTL_MS / 1000, 300);
});

test("the hub posts Connect for Meta and Monday, and keeps Shopify's GET", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /method=\{card\.source === "shopify" \? "GET" : "POST"\}/);
});

/* ------------------------------------------------------- end of /callback */

function fakeSession(error = null) {
  const calls = [];
  return { calls, session: { membership: { clientId: CLIENT }, api: { rpc: async (fn, args) => { calls.push([fn, args]); return { error }; } } } };
}

test("bindOrPick: zero options is an error and no write", async () => {
  const { calls, session } = fakeSession();
  const res = await bindOrPick("meta", session, getConfig(), handoff("meta", []));
  assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
  assert.equal(calls.length, 0);
});

test("bindOrPick: exactly one option connects it, with the token as p_secret only", async () => {
  const { calls, session } = fakeSession();
  const res = await bindOrPick("meta", session, getConfig(), { ...handoff("meta", [OPTIONS.meta[0]]), expiresAt: "2026-11-20T00:00:00.000Z" });
  assert.equal(res.headers.get("location"), `${HUB}/?connected=meta`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "connect_source");
  assert.equal(calls[0][1].p_config.act_id, "act_111");
  assert.equal(calls[0][1].p_secret, "TOKEN_meta");
});

test("bindOrPick: a write error is connect-failed and the rpc message (which can echo the token) is not logged", async () => {
  const { session } = fakeSession({ code: "P0001", message: "bad TOKEN_monday" });
  const warn = console.warn;
  const logged = [];
  console.warn = (...a) => logged.push(a.join(" "));
  try {
    const res = await bindOrPick("monday", session, getConfig(), handoff("monday", [OPTIONS.monday[0]]));
    assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
  } finally {
    console.warn = warn;
  }
  assert.doesNotMatch(logged.join("\n"), /TOKEN_monday/);
});

for (const src of ["meta", "monday"]) {
  test(`${src} bindOrPick: several options write nothing and hand a sealed, path-scoped, short-lived pick cookie to /pick`, async () => {
    const { calls, session } = fakeSession();
    const res = await bindOrPick(src, session, getConfig(), handoff(src));
    assert.equal(calls.length, 0);
    assert.equal(res.headers.get("location"), `${HUB}${pickPath(src)}`);
    const cookie = res.cookies.get(pickCookie(src));
    assert.equal(cookie.path, pickPath(src));
    assert.equal(cookie.maxAge, PICK_TTL_MS / 1000);
    assert.equal(cookie.httpOnly, true);
    assert.doesNotMatch(cookie.value, new RegExp(`TOKEN_${src}`));
    assert.ok(openPick(cookie.value, SECRETS[src], src).ok);
    assert.doesNotMatch(res.headers.get("location"), /TOKEN/);
  });
}

/* ----------------------------------------------------------------- /pick */

const pickReq = (src, { id, cookie = sealPick(handoff(src), SECRETS[src], src), headers = {} } = {}) =>
  new NextRequest(`${HUB}${pickPath(src)}`, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", origin: HUB, cookie: `${pickCookie(src)}=${cookie}`, ...headers },
    body: id === undefined ? new URLSearchParams() : new URLSearchParams({ id }),
  });

for (const src of ["meta", "monday"]) {
  const [listed] = OPTIONS[src];
  const unlisted = src === "meta" ? "act_999" : "99";

  test(`${src} /pick: an id the provider did not return for this token is refused`, async () => {
    for (const id of [unlisted, "", undefined]) {
      const res = await pickPOST(pickReq(src, { id }), src);
      assert.equal(res.status, 303);
      assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`, String(id));
      assert.match(res.headers.get("set-cookie") ?? "", new RegExp(`${pickCookie(src)}=;`));
    }
  });

  test(`${src} /pick: a listed id passes the membership check and reaches the owner check`, async () => {
    const res = await pickPOST(pickReq(src, { id: listed.id }), src);
    assert.equal(res.headers.get("location"), `${HUB}/?error=forbidden`);
  });

  test(`${src} /pick: cross-site, no cookie, a forged cookie or the other source's cookie are refused`, async () => {
    const cross = await pickPOST(pickReq(src, { id: listed.id, headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" } }), src);
    assert.equal(cross.headers.get("location"), `${HUB}/?error=connect-failed`);
    for (const cookie of ["", "garbage", sealPick(handoff(src), "attacker-key", src)]) {
      const res = await pickPOST(pickReq(src, { id: listed.id, cookie }), src);
      assert.equal(res.headers.get("location"), `${HUB}/?error=connect-failed`);
    }
    const other = src === "meta" ? "monday" : "meta";
    const swapped = await pickPOST(pickReq(src, { id: listed.id, cookie: sealPick(handoff(src), SECRETS[src], other) }), src);
    assert.equal(swapped.headers.get("location"), `${HUB}/?error=connect-failed`);
  });

  test(`${src} /pick GET: needs the sealed cookie, then the owner`, async () => {
    const none = await pickGET(new NextRequest(`${HUB}${pickPath(src)}`), src);
    assert.equal(none.headers.get("location"), `${HUB}/?error=connect-failed`);
    const sealed = sealPick(handoff(src), SECRETS[src], src);
    const res = await pickGET(new NextRequest(`${HUB}${pickPath(src)}`, { headers: { cookie: `${pickCookie(src)}=${sealed}` } }), src);
    assert.equal(res.headers.get("location"), `${HUB}/?error=forbidden`);
  });

  test(`${src} /pick route exports GET (render) and POST (choose)`, async () => {
    const mod = await import(`../app/api/oauth/${src}/pick/route.ts`);
    assert.equal(typeof mod.GET, "function");
    assert.equal(typeof mod.POST, "function");
  });
}
