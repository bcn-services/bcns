/** seed-gtm.test.mjs — dry run prints and writes nothing; --apply path inserts once and refuses a second run. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeSb } from "./_fake-sb.mjs";

const { seedGtm, planSeed } = await import("../scripts/seed-gtm.ts");
const seed = JSON.parse(readFileSync(new URL("../scripts/seed-gtm.json", import.meta.url), "utf8"));
const ACTOR = "00000000-0000-4000-8000-000000000001";

test("seed json: the eight tracks, valid owners, no contact details", () => {
  assert.deepEqual(
    seed.tracks.map((t) => t.area),
    [
      "warm",
      "cousin-pilot",
      "interviews",
      "associations",
      "linkedin",
      "cold-calling",
      "demos",
      "seo-ads",
    ]
  );
  for (const t of seed.tracks)
    for (const s of t.steps) assert.ok(["nate", "brandon", "claude"].includes(s.owner), s.title);
  const raw = JSON.stringify(seed);
  assert.doesNotMatch(raw, /@[a-z0-9-]+\.[a-z]{2,}/i); // no emails
  assert.doesNotMatch(raw, /\d{3}[-. )]\s?\d{3}[-. ]\d{4}/); // no phone numbers
  assert.deepEqual(Object.keys(seed.lists).sort(), ["associations", "interviews", "warm"]);
});

test("dry run (no client) prints the plan and returns counts", async () => {
  const lines = [];
  const r = await seedGtm(null, "", seed, (l) => lines.push(l));
  assert.equal(
    r.tasks,
    seed.tracks.reduce((n, t) => n + t.steps.length, 0)
  );
  assert.match(lines[0], /^seed-gtm \(dry run\): \d+ tasks \(source=tracker\), \d+ list items$/);
  assert.match(lines.at(-1), /^dry run: nothing inserted\. Re-run with --apply/);
  assert.equal(lines.filter((l) => l.startsWith("  task  ")).length, r.tasks);
});

test("--apply inserts tracker tasks + one event, then refuses a second run", async () => {
  const sb = fakeSb();
  const withLists = { ...seed, lists: { warm: [{ business: "hq4-Fake Hardware" }] } };
  const r = await seedGtm(sb, ACTOR, withLists, () => {});
  assert.equal(sb.db.tasks.length, r.tasks);
  assert.ok(
    sb.db.tasks.every((t) => t.source === "tracker" && t.via === "job" && t.created_by === ACTOR)
  );
  assert.equal(sb.db.list_items.length, 1);
  assert.deepEqual(sb.db.list_items[0], {
    id: sb.db.list_items[0].id,
    list: "warm",
    business: "hq4-Fake Hardware",
    status: "todo",
    notes: null,
    who: null,
    sort: 0,
  });
  assert.equal(sb.db.events.filter((e) => e.kind === "seed.gtm").length, 1);
  const before = sb.db.tasks.length;
  await assert.rejects(() => seedGtm(sb, ACTOR, withLists, () => {}), /already seeded/);
  assert.equal(sb.db.tasks.length, before);
});

test("planSeed rejects an unknown owner, track, list or status", () => {
  const bad = (patch) => () => planSeed({ tracks: [], lists: {}, ...patch });
  assert.throws(
    bad({
      tracks: [
        { area: "warm", name: "w", steps: [{ title: "t", owner: "mallory", status: "todo" }] },
      ],
    }),
    /owner/
  );
  assert.throws(bad({ tracks: [{ area: "nope", name: "w", steps: [] }] }), /track/);
  assert.throws(bad({ lists: { friends: [] } }), /list/);
  assert.throws(bad({ lists: { warm: [{ business: "x", status: "bogus" }] } }), /status/);
});
