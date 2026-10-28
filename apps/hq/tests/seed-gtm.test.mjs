/** seed-gtm.test.mjs — dry run prints and writes nothing; --apply inserts tracks + steps, and a rerun is a no-op. */
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
  assert.match(
    lines[0],
    /^seed-gtm \(dry run\): \d+ tracks, \d+ tasks \(source=tracker\), \d+ list items$/
  );
  assert.equal(lines.filter((l) => l.startsWith("  track ")).length, seed.tracks.length);
  assert.match(lines.at(-1), /^dry run: nothing inserted\. Re-run with --apply/);
  assert.equal(lines.filter((l) => l.startsWith("  task  ")).length, r.tasks);
});

test("--apply inserts tracks, tracker tasks linked to them + one event; a second run changes nothing", async () => {
  const sb = fakeSb();
  const withLists = { ...seed, lists: { warm: [{ business: "hq4-Fake Hardware" }] } };
  const r = await seedGtm(sb, ACTOR, withLists, () => {});
  assert.equal(sb.db.tasks.length, r.tasks);
  assert.equal(sb.db.tracks.length, seed.tracks.length);
  assert.ok(
    sb.db.tasks.every((t) => t.source === "tracker" && t.via === "job" && t.created_by === ACTOR)
  );
  // every step points at the track it came from; "(later)" tracks land in Next, the rest in Now
  const trackOf = (title) => sb.db.tracks.find((t) => t.id === sb.db.tasks.find((x) => x.title === title).track_id);
  for (const t of seed.tracks) for (const st of t.steps) assert.equal(trackOf(st.title).name, t.name);
  assert.equal(sb.db.tracks.find((t) => /later/i.test(t.name)).column, "next");
  assert.equal(sb.db.tracks.find((t) => t.name === "Warm contacts").column, "now");
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
  const before = [sb.db.tasks.length, sb.db.tracks.length, sb.db.list_items.length, sb.db.events.length];
  const again = await seedGtm(sb, ACTOR, withLists, () => {});
  assert.deepEqual(again, { tracks: 0, tasks: 0, items: 0 });
  assert.deepEqual(
    [sb.db.tasks.length, sb.db.tracks.length, sb.db.list_items.length, sb.db.events.length],
    before
  );
});

test("--apply on a db seeded before tracks existed adds the tracks and back-fills track_id", async () => {
  const old = seed.tracks.flatMap((t) =>
    t.steps.map((s, i) => ({ id: `old-${t.area}-${i}`, title: s.title, source: "tracker", track_id: null }))
  );
  const sb = fakeSb({ tasks: old });
  await seedGtm(sb, ACTOR, seed, () => {});
  assert.equal(sb.db.tasks.length, old.length); // no duplicates
  assert.equal(sb.db.tracks.length, seed.tracks.length);
  assert.ok(sb.db.tasks.every((t) => t.track_id));
});

test("a rerun does not re-link a step someone unlinked from its track", async () => {
  const sb = fakeSb();
  await seedGtm(sb, ACTOR, seed, () => {});
  sb.db.tasks[0].track_id = null; // unlinked on purpose
  const r = await seedGtm(sb, ACTOR, seed, () => {});
  assert.deepEqual(r, { tracks: 0, tasks: 0, items: 0 });
  assert.equal(sb.db.tasks[0].track_id, null);
});

test("--apply inserts every task in ONE insert; a failed insert leaves nothing and a rerun works", async () => {
  const sb = fakeSb();
  let taskInserts = 0;
  const from = sb.from;
  sb.from = (t) => {
    const q = from(t);
    const ins = q.insert;
    q.insert = (p) => {
      if (t === "tasks") taskInserts++;
      return ins(p);
    };
    return q;
  };
  const r = await seedGtm(sb, ACTOR, seed, () => {});
  assert.equal(taskInserts, 1);
  assert.equal(sb.db.tasks.length, r.tasks);
  const bad = fakeSb({}, { failOn: { "tasks:insert": "boom" } });
  await assert.rejects(() => seedGtm(bad, ACTOR, seed, () => {}), /boom/);
  assert.equal(bad.db.tasks.length, 0);
  assert.equal(bad.db.events ?? undefined, undefined);
});

test("planSeed derives the column: all steps done -> done, all waiting -> wait", () => {
  const plan = planSeed({
    lists: {},
    tracks: [
      { area: "warm", name: "d", steps: [{ title: "a", owner: "nate", status: "done" }] },
      { area: "warm", name: "w", steps: [{ title: "b", owner: "nate", status: "waiting" }] },
      { area: "warm", name: "o", column: "next", steps: [{ title: "c", owner: "nate", status: "todo" }] },
    ],
  });
  assert.deepEqual(plan.tracks.map((t) => t.column), ["done", "wait", "next"]);
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
