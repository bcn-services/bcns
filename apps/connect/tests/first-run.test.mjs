/**
 * Hub first-run: the four checklist steps are driven by real rows, and /access only offers
 * starter questions for sources that are actually connected. Pure functions, no Next, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstRun, starterQuestions } from "../lib/first-run.ts";
import { readAiLastUsed } from "../lib/ai-settings.ts";

const T = "2026-10-01T12:00:00Z";
const row = (source, status, last_success_at = null) => ({ source, status, last_success_at, last_error: null });
const ME = "user-me";
const input = (over = {}) => ({
  health: [],
  members: [{ user_id: ME, role: "owner", is_smoke: false }],
  viewerUserId: ME,
  role: "owner",
  aiLastUsedAt: null,
  ...over,
});
const done = (r) => Object.fromEntries(r.steps.map((s) => [s.id, s.done]));

test("a brand-new owner: nothing done, checklist visible, steps in order", () => {
  const r = firstRun(input());
  assert.deepEqual(r.steps.map((s) => s.id), ["source", "sync", "team", "ai"]);
  assert.deepEqual(done(r), { source: false, sync: false, team: false, ai: false });
  assert.equal(r.doneCount, 0);
  assert.equal(r.visible, true);
});

test("connect a source: any connected card ticks it; auth_failed and unknown sources do not", () => {
  assert.equal(done(firstRun(input({ health: [row("shopify", "never_ran")] }))).source, true);
  assert.equal(done(firstRun(input({ health: [row("shopify", "auth_failed")] }))).source, false);
  assert.equal(done(firstRun(input({ health: [row("platform", "ok", T)] }))).source, false);
});

test("first sync: needs a non-null last_success_at, not just a row", () => {
  for (const status of ["never_ran", "error", "auth_failed"]) {
    assert.equal(done(firstRun(input({ health: [row("shopify", status, null)] }))).sync, false, status);
  }
  assert.equal(done(firstRun(input({ health: [row("shopify", "ok", T)] }))).sync, true);
  // a stale source that did sync once still counts: it has data
  assert.equal(done(firstRun(input({ health: [row("meta", "stale", T)] }))).sync, true);
  // a row for a source the hub does not show never counts
  assert.equal(done(firstRun(input({ health: [row("platform", "ok", T)] }))).sync, false);
});

test("invite team: needs a non-smoke member who is not the viewer", () => {
  const viewerOnly = [{ user_id: ME, is_smoke: false }];
  const smokeOnly = [...viewerOnly, { user_id: "smoke-1", is_smoke: true }];
  const invited = [...viewerOnly, { user_id: "u2", is_smoke: false }];
  assert.equal(done(firstRun(input({ members: viewerOnly }))).team, false);
  assert.equal(done(firstRun(input({ members: smokeOnly }))).team, false);
  assert.equal(done(firstRun(input({ members: invited }))).team, true);
  assert.equal(done(firstRun(input({ members: null }))).team, false);
});

test("connect AI: only a real timestamp ticks it; null, empty and garbage do not", () => {
  assert.equal(done(firstRun(input({ aiLastUsedAt: T }))).ai, true);
  for (const v of [null, undefined, "", "not a date"]) {
    assert.equal(done(firstRun(input({ aiLastUsedAt: v }))).ai, false, String(v));
  }
});

test("all four done hides the checklist; three of four keeps it", () => {
  const all = input({
    health: [row("shopify", "ok", T)],
    members: [{ user_id: ME }, { user_id: "u2" }],
    aiLastUsedAt: T,
  });
  const r = firstRun(all);
  assert.equal(r.allDone, true);
  assert.equal(r.visible, false);
  const almost = firstRun({ ...all, aiLastUsedAt: null });
  assert.equal(almost.doneCount, 3);
  assert.equal(almost.visible, true);
});

test("a completed checklist stays hidden after the owner disconnects the only source", () => {
  const finished = input({
    health: [row("shopify", "ok", T)],
    members: [{ user_id: ME }, { user_id: "u2" }],
    aiLastUsedAt: T,
  });
  assert.equal(firstRun(finished).visible, false);
  // Disconnect deletes the source's health row (platform/worker disconnect.ts): no cards, no sync time.
  const after = firstRun({ ...finished, health: [] });
  assert.equal(after.allDone, true);
  assert.equal(after.visible, false);
});

test("monotonic: a sync time proves a source was connected; an AI question proves both", () => {
  // token revoked since: the card is not connected, but the data arrived once
  assert.equal(done(firstRun(input({ health: [row("shopify", "auth_failed", T)] }))).source, true);
  const asked = done(firstRun(input({ aiLastUsedAt: T })));
  assert.equal(asked.source, true);
  assert.equal(asked.sync, true);
  // nothing asked, nothing connected: still not ticked
  assert.equal(done(firstRun(input())).source, false);
});

test("members never see the checklist, even with nothing done", () => {
  assert.equal(firstRun(input({ role: "member" })).visible, false);
  assert.equal(firstRun(input({ role: null })).visible, false);
});

test("owner links point at the right pages", () => {
  const hrefs = Object.fromEntries(firstRun(input()).steps.map((s) => [s.id, s.href]));
  assert.deepEqual(hrefs, { source: "#sources", sync: "#sources", team: "/team", ai: "/access" });
});

test("starter questions: none when nothing is connected", () => {
  assert.deepEqual(starterQuestions([]), []);
  assert.deepEqual(starterQuestions(null), []);
});

test("starter questions: only connected sources, in hub order, 3 to 5 each", () => {
  const groups = starterQuestions([
    row("monday", "ok", T),
    row("shopify", "never_ran"),
    row("meta", "auth_failed"),
    row("platform", "ok", T),
  ]);
  assert.deepEqual(groups.map((g) => g.source), ["shopify", "monday"]);
  for (const g of groups) assert.ok(g.questions.length >= 3 && g.questions.length <= 5, g.source);
  assert.equal(groups[0].title, "Shopify");
});

test("every hub source has 3 to 5 plain questions and no jargon", () => {
  const all = ["shopify", "meta", "monday", "meet", "drive", "quickbooks"].map((s) => row(s, "ok", T));
  const groups = starterQuestions(all);
  assert.equal(groups.length, 6);
  for (const g of groups) {
    assert.ok(g.questions.length >= 3 && g.questions.length <= 5, g.source);
    for (const q of g.questions) assert.ok(!/\b(MCP|OAuth|API|SQL|connector|view|sync)\b/i.test(q), q);
  }
});

test("readAiLastUsed: a timestamp passes through; an error or throw reads as null, never crashes", async () => {
  const ok = { rpc: async () => ({ data: T, error: null }) };
  assert.equal(await readAiLastUsed(ok), T);
  const none = { rpc: async () => ({ data: null, error: null }) };
  assert.equal(await readAiLastUsed(none), null);
  const missing = { rpc: async () => ({ data: null, error: { message: "function not found" } }) };
  assert.equal(await readAiLastUsed(missing), null);
  const boom = { rpc: async () => { throw new Error("network"); } };
  assert.equal(await readAiLastUsed(boom), null);
  // a function-not-found error must not tick the step even if data were somehow set
  const errWithData = { rpc: async () => ({ data: T, error: { message: "x" } }) };
  assert.equal(await readAiLastUsed(errWithData), null);
});
