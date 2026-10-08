/**
 * Owner disconnect (POST /api/sources/<source>/disconnect), asserted without a
 * server or database. The RPC and the worker's upstream revoke are covered in
 * platform/test/quickbooks-disconnect.test.ts (DB) and disconnect-upstream.test.ts;
 * here: the route's guards, the call it makes, when a page offers the control,
 * and what the confirm text promises.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DISCONNECTABLE,
  HUB_SOURCES,
  canDisconnect,
  composeSources,
  disconnectCopy,
  disconnectPath,
  disconnectedNote,
  googleSiblingConnected,
  isDisconnectable,
} from "../lib/sources.ts";
import { sourcePage } from "../lib/source-settings.ts";

const HUB = "https://connect.bcn-services.com";
const ROUTE = new URL("../app/api/sources/[source]/disconnect/route.ts", import.meta.url);
const SAME = { "sec-fetch-site": "same-origin" };

async function load() {
  Object.assign(process.env, { HUB_BASE_URL: HUB });
  // session.ts wraps loaders in React's server-only cache(); absent outside Next.
  const react = createRequire(import.meta.url)("react");
  react.cache ??= (fn) => fn;
  const { NextRequest } = await import("next/server");
  const { POST } = await import(ROUTE.href);
  const post = (source, headers = SAME) =>
    POST(new NextRequest(`${HUB}/api/sources/${source}/disconnect`, { method: "POST", headers }), { params: { source } });
  return { post };
}

test("allow-list: exactly the five disconnectable sources, never Shopify", () => {
  assert.deepEqual([...DISCONNECTABLE].sort(), ["drive", "meet", "meta", "monday", "quickbooks"]);
  for (const s of ["quickbooks", "meet", "drive", "monday", "meta"]) assert.equal(isDisconnectable(s), true, s);
  for (const s of ["shopify", "upload", "platform", "", "QUICKBOOKS", "quickbooks/", undefined, null, 1]) {
    assert.equal(isDisconnectable(s), false, String(s));
  }
  assert.equal(disconnectPath("meet"), "/api/sources/meet/disconnect");
});

test("a cross-site POST is refused before any session read", async () => {
  const { post } = await load();
  for (const headers of [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.example" }]) {
    const res = await post("quickbooks", headers);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), `${HUB}/?error=disconnect-failed`);
  }
});

test("Shopify and unknown sources are refused before the session and the RPC", async () => {
  const { post } = await load();
  for (const source of ["shopify", "upload", "nope"]) {
    const res = await post(source);
    assert.equal(res.status, 303);
    // No session exists here: reaching ownerSession would answer forbidden instead.
    assert.equal(res.headers.get("location"), `${HUB}/?error=disconnect-failed`, source);
  }
});

test("every disconnectable source without an owner session is forbidden", async () => {
  const { post } = await load();
  for (const source of ["quickbooks", "meet", "drive", "monday", "meta"]) {
    const res = await post(source);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), `${HUB}/?error=forbidden`, source);
  }
});

test("route: POST only, cross-site, allow-list, owner, then the RPC with the checked source", () => {
  const src = readFileSync(ROUTE, "utf8");
  assert.doesNotMatch(src, /export async function GET/);
  const cross = src.indexOf("isCrossSite(");
  const allow = src.indexOf("isDisconnectable(source)");
  const owner = src.indexOf("ownerSession()");
  const rpc = src.indexOf('rpc("disconnect_source", { p_source: source })');
  assert.ok(cross > -1 && allow > cross && owner > allow && rpc > owner, "guards run in order before the RPC");
  assert.match(src, /\?disconnected=\$\{source\}/);
  // The hub never touches the token: no source_tokens, no provider call.
  assert.doesNotMatch(src, /source_tokens|intuit\.com|googleapis|graph\.facebook|fetch\(/);
});

test("the old QuickBooks-only route is gone and nothing points at it", () => {
  assert.throws(() => readFileSync(new URL("../app/api/oauth/quickbooks/disconnect/route.ts", import.meta.url)));
  for (const f of ["../app/page.tsx", "../app/disconnect.tsx", "../app/sources/[source]/page.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8"), /oauth\/quickbooks\/disconnect/);
  }
});

test("canDisconnect: every source x role x status; Shopify never", () => {
  const statuses = ["ok", "stale", "auth_failed", "error", "never_ran", "none"];
  for (const source of HUB_SOURCES) {
    for (const role of ["owner", "member", null, undefined, "OWNER"]) {
      for (const status of statuses) {
        const want = source !== "shopify" && role === "owner" && status !== "none";
        assert.equal(canDisconnect({ source, status }, role), want, `${source}/${role}/${status}`);
      }
    }
  }
  assert.equal(canDisconnect({ source: "shopify", status: "ok" }, "owner"), false);
});

test("confirm text: names what is deleted and the fresh re-import, per source", () => {
  const titles = { quickbooks: "QuickBooks", meet: "Google Meet", drive: "Google Drive", monday: "Monday.com", meta: "Meta Ads" };
  for (const [source, title] of Object.entries(titles)) {
    const text = disconnectCopy(source).join(" ");
    assert.ok(text.includes(`deletes the ${title} data bcns has stored for this workspace`), source);
    assert.ok(text.includes("Reconnecting later re-imports everything from the start"), source);
    // Monday's own labels ("API token", "My access tokens") are what the owner sees there; nothing else may say token.
    assert.doesNotMatch(text.replace(/API token|that token|My access tokens/g, ""), /MCP|OAuth|cursor|token|backfill/i, source);
  }
  assert.match(disconnectCopy("quickbooks").join(" "), /cancels its access to your QuickBooks account/);
  assert.match(disconnectCopy("meta").join(" "), /cancels its access to your Meta Ads account/);
  // Monday: no revoke endpoint, so the owner is told to remove bcns there too, and never promised a cancel.
  const monday = disconnectCopy("monday").join(" ");
  assert.match(monday, /no way for bcns to cancel its access/);
  // Both ways a Monday connection is made: the Connect button (an installed app) and a pasted API token.
  assert.match(monday, /If you connected with the Connect button, uninstall bcns \(your profile picture, then Administration, then Apps, then Uninstall\)/);
  assert.match(monday, /If you gave bcns an API token, regenerate it \(your profile picture, then Developers, then My access tokens\)/);
  assert.doesNotMatch(monday, /bcns also cancels/);
});

test("meet/drive confirm text follows the worker's Google rule: keep the grant only while the other one is connected", () => {
  const sibling = { meet: "Google Drive", drive: "Google Meet" };
  for (const [source, other] of Object.entries(sibling)) {
    const kept = disconnectCopy(source, { siblingConnected: true }).join(" ");
    assert.ok(
      kept.endsWith(`${other} stays connected: it is connected separately. Google removes bcns's access once both Google Meet and Google Drive are disconnected.`),
      source,
    );
    assert.doesNotMatch(kept, /cancels its access|MCP|OAuth|cursor|token|backfill/i, source);
    // Not connected (the default too): the worker revokes Google's grant, and the text never claims the other one syncs.
    for (const alone of [disconnectCopy(source, { siblingConnected: false }), disconnectCopy(source)]) {
      assert.ok(alone.join(" ").endsWith("bcns also cancels its access to your Google account."), source);
      assert.doesNotMatch(alone.join(" "), /stays connected|keeps syncing|connected separately/, source);
    }
    // Unknown (the health read failed): only the sentence true either way, no claim about the other one.
    const unknown = disconnectCopy(source, { siblingConnected: null });
    assert.equal(unknown.length, 2, source);
    assert.equal(unknown[1], "Google removes bcns's access once both Google Meet and Google Drive are disconnected.", source);
  }
  // Never "keeps syncing": a "Reconnect needed" sibling syncs nothing, it only stays connected.
  assert.doesNotMatch(disconnectCopy("meet", { siblingConnected: true }).join(" "), /keeps syncing/);
});

test("source page: a failed health read gives the unknown (null) Google text, never the not-connected one", () => {
  const page = readFileSync(new URL("../app/sources/[source]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /siblingConnected=\{\s*health\.error \? null : googleSiblingConnected\(/);
  assert.match(page, /health: health\.error \? null : \(health\.data as HealthRow\[\] \| null\)/);
});

test("googleSiblingConnected: the other Google card is anything but Not connected; never for other sources", () => {
  const cards = (meet, drive) => [{ source: "shopify", status: "ok" }, { source: "meet", status: meet }, { source: "drive", status: drive }];
  for (const status of ["ok", "stale", "auth_failed", "error", "never_ran"]) {
    assert.equal(googleSiblingConnected("meet", cards("none", status)), true, `drive ${status}`);
    assert.equal(googleSiblingConnected("drive", cards(status, "none")), true, `meet ${status}`);
  }
  assert.equal(googleSiblingConnected("meet", cards("ok", "none")), false);
  assert.equal(googleSiblingConnected("drive", cards("none", "none")), false);
  assert.equal(googleSiblingConnected("drive", [{ source: "drive", status: "ok" }]), false);
  for (const s of ["quickbooks", "meta", "monday", "shopify"]) assert.equal(googleSiblingConnected(s, cards("ok", "ok")), false, s);
});

test("banner: only for a disconnectable source", () => {
  assert.equal(disconnectedNote("meta"), "Meta Ads is disconnected. bcns is deleting the Meta Ads data it stored for this workspace.");
  for (const v of ["shopify", "<script>", "", undefined]) assert.equal(disconnectedNote(v), null);
});

test("pages: both render the one shared two-step <details> control, gated by canDisconnect, no window.confirm", () => {
  const control = readFileSync(new URL("../app/disconnect.tsx", import.meta.url), "utf8");
  assert.match(control, /<details className="disc">\s*<summary>Disconnect<\/summary>/);
  assert.match(control, /<form action=\{disconnectPath\(source\)\} method="POST">/);
  assert.match(control, /disconnectCopy\(source, \{ siblingConnected \}\)/);
  const hub = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(
    hub,
    /canDisconnect\(card, membership\.role\) \? \(\s*<DisconnectControl source=\{card\.source\} siblingConnected=\{googleSiblingConnected\(card\.source, cards\)\} \/>/,
  );
  assert.match(hub, /disconnectedNote\(searchParams\.disconnected\)/);
  const page = readFileSync(new URL("../app/sources/[source]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /canDisconnect\(disc, membership\.role\) \?/);
  assert.match(
    page,
    /<DisconnectControl\s+source=\{disc\.source\}\s+siblingConnected=\{\s*health\.error \? null : googleSiblingConnected\(source, composeSources\(health\.data as HealthRow\[\] \| null\)\)\s*\}\s+\/>/,
  );
  // The sibling is read from the health view (the hub never reads data.source_tokens).
  assert.match(page, /api\.from\("connector_health_v1"\)\.select\("source,status,last_success_at,last_error"\)/);
  assert.doesNotMatch(page, /source_tokens/);
  for (const src of [control, hub, page]) assert.doesNotMatch(src, /window\.confirm|alert\(|<details className="disc">[\s\S]*<details className="disc">/);
});

test("disconnecting: deleted-but-not-yet-gone reads Disconnecting, with no connect, request or disconnect form, for owner and member", () => {
  const NOTE = "bcns is deleting the QuickBooks data it stored for this workspace. You can connect it again once that is done. If this still shows tomorrow, email nseluga@bcn-services.com.";
  // disconnect_source deletes the health row, so a disconnecting source has none.
  const cards = composeSources([{ source: "meta", status: "ok", last_success_at: null, last_error: null }], ["quickbooks"]);
  const qb = cards.find((c) => c.source === "quickbooks");
  assert.equal(qb.disconnecting, true);
  assert.equal(qb.connected, false);
  assert.equal(qb.label, "Disconnecting");
  assert.equal(qb.disconnectingNote, NOTE);
  assert.equal(cards.find((c) => c.source === "meta").disconnecting, false);
  assert.equal(cards.find((c) => c.source === "meta").disconnectingNote, null);
  for (const role of ["owner", "member"]) assert.equal(canDisconnect(qb, role), false, role);

  // The home card: no "Last success: never", and the whole footer (Connect, Request connection,
  // Disconnect: every form on the card) is skipped.
  const hub = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(hub, /api\.rpc\("disconnecting_sources_v1"\)/);
  assert.match(hub, /card\.disconnectingNote \?\? \(card\.pending/);
  assert.match(hub, /\{card\.disconnecting \? null : \(\s*<div className="sc-f">/);

  // /sources/<s>: same note, no Re-sync, Change folder or Disconnect, no stale run list.
  const settingsRow = {
    source: "quickbooks", enabled: false, last_run_at: null, last_success_at: null, next_run_at: null,
    last_reset_at: null, folder_changed_at: null, sync_running: false, target: { realm_id: "9130" },
  };
  for (const role of ["owner", "member"]) {
    const page = sourcePage({
      source: "quickbooks", settings: [settingsRow], runs: [{ mode: "full", status: "success", started_at: "2026-10-06T10:00:00Z", finished_at: null, rows_fetched: 3, error: null }],
      role, now: new Date("2026-10-07T12:00:00Z"), health: [], disconnecting: ["quickbooks"],
    });
    assert.equal(page.disconnecting, NOTE, role);
    assert.deepEqual(page.status, { label: "Disconnecting", tone: "idle" }, role);
    assert.equal(page.connected, false, role);
    assert.equal(page.resync, null, role);
    assert.equal(page.folder, null, role);
    assert.deepEqual(page.runs, [], role);
    assert.equal(canDisconnect({ source: "quickbooks", status: page.connected ? "ok" : "none" }, role), false, role);
  }
  const src = readFileSync(new URL("../app/sources/[source]/page.tsx", import.meta.url), "utf8");
  assert.match(src, /api\.rpc\("disconnecting_sources_v1"\)/);
  assert.match(src, /page\.disconnecting \? \(/);
  // Without the read (or when it failed) nothing is disconnecting.
  assert.equal(composeSources([], null).every((c) => !c.disconnecting), true);
});
