/**
 * /sources/[source]: folder-link parsing, the allow-listed target, the one-hour re-sync rule,
 * error mapping, the empty-folder warning, and the two owner mutations with injected deps.
 * Pure: no Next, no network, no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FOLDER_WARNING,
  ERROR_MESSAGES,
  TARGET_KEYS,
  changeFolder,
  errorFlag,
  folderCheck,
  friendlyError,
  isHubSource,
  parseDriveFolder,
  resetState,
  resyncSource,
  sourcePage,
  targetFor,
} from "../lib/source-settings.ts";

const ID = "1AbC_dEf-GhIjKlMnOp";
const URL_OF = `https://drive.google.com/drive/folders/${ID}`;

test("parseDriveFolder accepts the four shapes Drive hands out", () => {
  for (const input of [
    ID,
    `  ${ID}  `,
    URL_OF,
    `${URL_OF}/`,
    `${URL_OF}?usp=sharing`,
    `https://drive.google.com/drive/u/1/folders/${ID}?usp=drive_link`,
    `https://drive.google.com/open?id=${ID}`,
  ]) {
    assert.deepEqual(parseDriveFolder(input), { id: ID, url: URL_OF }, input);
  }
});

test("parseDriveFolder refuses other hosts, schemes and malformed ids", () => {
  for (const input of [
    `https://evil.example/drive/folders/${ID}`,
    `https://drive.google.com.evil.example/drive/folders/${ID}`,
    `https://docs.google.com/drive/folders/${ID}`,
    `http://drive.google.com/drive/folders/${ID}`,
    `javascript:alert(1)//drive.google.com/drive/folders/${ID}`,
    `https://user:pw@drive.google.com/drive/folders/${ID}`,
    `https://drive.google.com/drive/folders/short`,
    `https://drive.google.com/drive/folders/${ID}'or'1`,
    `https://drive.google.com/file/d/${ID}/view`,
    "short",
    `${ID}' in parents or '`,
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(parseDriveFolder(input), null, String(input));
  }
});

test("targetFor reads TARGET_KEYS only and rechecks every link", () => {
  assert.deepEqual([...TARGET_KEYS], ["folder_id", "notes_url", "board_url", "board_id", "admin_url", "shop", "realm_id"]);
  const leaky = { folder_id: ID, oauth_client_id: "client-123", oauth_client_secret: "s", notes_url: "https://drive.google.com/old" };
  const meet = targetFor("meet", leaky);
  assert.deepEqual(meet, [{ label: "Folder", text: ID, href: URL_OF }]);
  assert.ok(!JSON.stringify(meet).includes("client-123"));

  assert.deepEqual(targetFor("monday", { board_id: "9", board_url: "https://acme.monday.com/boards/9" }), [
    { label: "Board", text: "9", href: "https://acme.monday.com/boards/9" },
  ]);
  assert.deepEqual(targetFor("monday", { board_id: "9", board_url: "javascript:alert(1)" }), [
    { label: "Board", text: "9", href: null },
  ]);
  assert.deepEqual(targetFor("monday", { board_id: "9", board_url: "https://monday.com.evil.example/x" }), [
    { label: "Board", text: "9", href: null },
  ]);
  assert.deepEqual(targetFor("shopify", { shop: "acme.myshopify.com", admin_url: "https://evil.example" }), [
    { label: "Store", text: "acme.myshopify.com", href: "https://admin.shopify.com/store/acme" },
  ]);
  assert.deepEqual(targetFor("quickbooks", { realm_id: "1234" }), [{ label: "Company ID", text: "1234", href: null }]);
  assert.deepEqual(targetFor("meta", { act_id: "act_1" }), []);
  assert.deepEqual(targetFor("drive", null), []);
  assert.deepEqual(targetFor("drive", { folder_id: "x' or '1" }), [{ label: "Folder", text: "x' or '1", href: null }]);
});

test("resetState: ready, an hour after the last one, or never while a sync runs", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  assert.deepEqual(resetState(null, false, now), { kind: "ready" });
  assert.deepEqual(resetState("2026-10-06T11:30:00Z", false, now), { kind: "wait", until: "2026-10-06T12:30:00.000Z" });
  assert.deepEqual(resetState("2026-10-06T11:00:00Z", false, now), { kind: "ready" });
  assert.deepEqual(resetState(null, true, now), { kind: "running" });
  assert.deepEqual(resetState("garbage", false, now), { kind: "ready" });
});

test("errorFlag maps every database refusal to its message", () => {
  assert.equal(errorFlag({ code: "BCNS2", message: "forbidden_role" }), "forbidden");
  assert.equal(errorFlag({ code: "BCNS3", message: "validation", details: "folder_id" }), "invalid-folder");
  assert.equal(errorFlag({ code: "BCNS3", message: "validation", details: "folder_url" }), "invalid-folder");
  assert.equal(errorFlag({ code: "BCNS3", message: "validation", details: "source" }), "failed");
  assert.equal(errorFlag({ code: "BCNS4", message: "not_found", details: "source" }), "not-connected");
  assert.equal(errorFlag({ code: "BCNS9", message: "rate_limited", details: "2026-10-06T12:30:00Z" }), "rate-limited");
  assert.equal(errorFlag({ code: "BCNS9", message: "sync_running" }), "sync-running");
  assert.equal(errorFlag({ code: "42883", message: "function does not exist" }), "failed");
  assert.equal(errorFlag(null), "failed");
  for (const flag of ["forbidden", "invalid-folder", "not-connected", "rate-limited", "sync-running", "failed"]) {
    assert.ok(ERROR_MESSAGES[flag], flag);
    assert.doesNotMatch(ERROR_MESSAGES[flag], /cursor|oauth|mcp|rpc/i);
  }
});

test("friendlyError points at the fix, never at the jargon", () => {
  assert.equal(friendlyError(null), null);
  assert.equal(friendlyError("  "), null);
  assert.match(friendlyError("400 invalid_grant: Token has been expired or revoked."), /Reconnect/);
  assert.match(friendlyError("403 The user does not have sufficient permissions for file x."), /shared with the Google account/);
  assert.match(friendlyError("404 File not found: 1AbC"), /couldn't find that folder/);
  assert.match(friendlyError("drive: folder walk stopped at 5000 folders"), /too many subfolders/);
  assert.match(friendlyError("403 User Rate Limit Exceeded"), /slow down/);
  assert.match(friendlyError("fetch failed: ETIMEDOUT timeout"), /next sync/);
  assert.match(friendlyError("TypeError: x is undefined"), /bcns has been notified/);
});

const run = (over) => ({
  mode: "backfill", status: "ok", started_at: "2026-10-06T12:05:00Z", finished_at: "2026-10-06T12:06:00Z",
  rows_fetched: 0, rows_upserted: 0, error: null, ...over,
});

test("folderCheck: pending, found, empty, failed — only full syncs after the change count", () => {
  const changed = "2026-10-06T12:00:00Z";
  assert.equal(folderCheck([], null), "none");
  assert.equal(folderCheck([], changed), "pending");
  assert.equal(folderCheck([run({ status: "running", finished_at: null })], changed), "pending");
  assert.equal(folderCheck([run({ started_at: "2026-10-06T11:00:00Z", rows_fetched: 9 })], changed), "pending");
  assert.equal(folderCheck([run({ mode: "incremental", rows_fetched: 9 })], changed), "pending");
  assert.equal(folderCheck([run({ rows_fetched: 0 })], changed), "empty");
  assert.equal(folderCheck([run({ rows_fetched: 0 }), run({ rows_fetched: 3 })], changed), "found");
  assert.equal(folderCheck([run({ status: "error", error: "404" })], changed), "failed");
  assert.match(EMPTY_FOLDER_WARNING, /didn't find any files in that folder/);
});

const settings = (over = {}) => ({
  source: "drive", enabled: true, last_run_at: null, last_success_at: null, next_run_at: null,
  last_reset_at: null, folder_changed_at: null, sync_running: false, target: { folder_id: ID }, ...over,
});
const NOW = new Date("2026-10-06T12:00:00Z");

test("sourcePage: owners get the controls, members and Shopify do not", () => {
  const owner = sourcePage({ source: "drive", settings: [settings()], runs: [], role: "owner", now: NOW });
  assert.equal(owner.connected, true);
  assert.equal(owner.resync.kind, "ready");
  assert.deepEqual(owner.folder, { current: ID, check: "none" });

  const member = sourcePage({ source: "drive", settings: [settings()], runs: [], role: "member", now: NOW });
  assert.equal(member.resync, null);
  assert.equal(member.folder, null);
  assert.equal(member.target.length, 1);

  const shop = sourcePage({
    source: "shopify", settings: [settings({ source: "shopify", target: { shop: "acme.myshopify.com" } })],
    runs: [], role: "owner", now: NOW,
  });
  assert.equal(shop.resync, null);
  assert.equal(shop.folder, null);
  assert.equal(shop.shopSwitchByEmail, true);

  const monday = sourcePage({ source: "monday", settings: [settings({ source: "monday" })], runs: [], role: "owner", now: NOW });
  assert.ok(monday.resync);
  assert.equal(monday.folder, null);

  const off = sourcePage({ source: "drive", settings: [settings({ enabled: false })], runs: [], role: "owner", now: NOW });
  assert.equal(off.connected, false);
  assert.equal(off.resync, null);

  const other = sourcePage({ source: "meet", settings: [settings()], runs: null, role: "owner", now: NOW });
  assert.equal(other.connected, false);
});

test("sourcePage: runs are capped at 20 and labelled in plain words", () => {
  const runs = Array.from({ length: 25 }, () => run({ status: "error", error: "404 File not found", rows_fetched: 2 }));
  const page = sourcePage({ source: "drive", settings: [settings()], runs, role: "member", now: NOW });
  assert.equal(page.runs.length, 20);
  assert.deepEqual(
    { kind: page.runs[0].kind, status: page.runs[0].status, tone: page.runs[0].tone, rows: page.runs[0].rows },
    { kind: "Full sync", status: "Failed", tone: "error", rows: 2 }
  );
  assert.match(page.runs[0].problem, /couldn't find/);
  assert.equal(page.runs[0].raw, "404 File not found");
  const inc = sourcePage({ source: "drive", settings: [settings()], runs: [run({ mode: "incremental" })], role: "owner", now: NOW });
  assert.equal(inc.runs[0].kind, "Update");
  assert.equal(inc.runs[0].status, "Done");
});

test("sourcePage: re-sync waits an hour and is blocked while a sync runs", () => {
  const wait = sourcePage({
    source: "drive", settings: [settings({ last_reset_at: "2026-10-06T11:45:00Z" })], runs: [], role: "owner", now: NOW,
  });
  assert.equal(wait.resync.kind, "wait");
  assert.equal(wait.resync.until, "2026-10-06T12:45:00.000Z");
  const busy = sourcePage({ source: "drive", settings: [settings({ sync_running: true })], runs: [], role: "owner", now: NOW });
  assert.equal(busy.resync.kind, "running");
});

function fakeDeps({ error = null, throws = false, role = "owner" } = {}) {
  const calls = [];
  const revalidated = [];
  return {
    calls,
    revalidated,
    deps: {
      requireOwner: async (denyTo) => {
        if (role !== "owner") throw new Error(`redirect:${denyTo}?error=forbidden`);
        return {
          api: {
            rpc: async (fn, args) => {
              calls.push([fn, args]);
              if (throws) throw new Error("network");
              return { error };
            },
          },
        };
      },
      revalidate: (p) => revalidated.push(p),
    },
  };
}

const form = (entries) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

test("resyncSource calls reset_source_cursors once and redirects with the outcome", async () => {
  const ok = fakeDeps();
  assert.equal(await resyncSource(form({ source: "meet" }), ok.deps), "/sources/meet?ok=resync");
  assert.deepEqual(ok.calls, [["reset_source_cursors", { p_source: "meet" }]]);
  assert.deepEqual(ok.revalidated, ["/sources/meet"]);

  const limited = fakeDeps({ error: { code: "BCNS9", message: "rate_limited" } });
  assert.equal(await resyncSource(form({ source: "meet" }), limited.deps), "/sources/meet?error=rate-limited");
  assert.deepEqual(limited.revalidated, []);

  const down = fakeDeps({ throws: true });
  assert.equal(await resyncSource(form({ source: "meet" }), down.deps), "/sources/meet?error=failed");

  const shop = fakeDeps();
  assert.equal(await resyncSource(form({ source: "shopify" }), shop.deps), "/sources/shopify?error=failed");
  assert.deepEqual(shop.calls, []);

  const bogus = fakeDeps();
  assert.equal(await resyncSource(form({ source: "../team" }), bogus.deps), "/");
  assert.deepEqual(bogus.calls, []);

  await assert.rejects(resyncSource(form({ source: "meet" }), fakeDeps({ role: "member" }).deps), /forbidden/);
});

test("changeFolder sends the parsed id and canonical link, and refuses bad input before the database", async () => {
  const ok = fakeDeps();
  assert.equal(
    await changeFolder(form({ source: "drive", folder: `https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing` }), ok.deps),
    "/sources/drive?ok=folder"
  );
  assert.deepEqual(ok.calls, [["set_source_folder", { p_source: "drive", p_folder_id: ID, p_folder_url: URL_OF }]]);

  const bad = fakeDeps();
  assert.equal(await changeFolder(form({ source: "drive", folder: "https://evil.example/x" }), bad.deps), "/sources/drive?error=invalid-folder");
  assert.deepEqual(bad.calls, []);

  const monday = fakeDeps();
  assert.equal(await changeFolder(form({ source: "monday", folder: ID }), monday.deps), "/sources/monday?error=failed");
  assert.deepEqual(monday.calls, []);

  const busy = fakeDeps({ error: { code: "BCNS9", message: "sync_running" } });
  assert.equal(await changeFolder(form({ source: "meet", folder: ID }), busy.deps), "/sources/meet?error=sync-running");
});

test("isHubSource is the route's allow-list", () => {
  for (const s of ["shopify", "meta", "monday", "meet", "drive", "quickbooks"]) assert.equal(isHubSource(s), true);
  for (const s of ["upload", "platform", "dashboard", "", "MEET", null, "drive/../x"]) assert.equal(isHubSource(s), false);
});
