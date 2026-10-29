/** seed-tracks.test.mjs — dry run writes nothing; --apply inserts the five missing fixed tracks in Now; a rerun is a no-op. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSb } from "./_fake-sb.mjs";

const { seedTracks } = await import("../scripts/seed-tracks.ts");
const { FIXED_TRACKS } = await import("../lib/tracks.ts");
const ACTOR = "00000000-0000-4000-8000-000000000001";

test("dry run prints the plan and returns 0", async () => {
  const lines = [];
  assert.equal(await seedTracks(null, "", (l) => lines.push(l)), 0);
  assert.match(lines[0], /^seed-tracks \(dry run\): 5 fixed tracks$/);
  assert.equal(lines.filter((l) => l.startsWith("  track ")).length, 5);
});

test("--apply adds only the missing names, in Now; a rerun changes nothing", async () => {
  const sb = fakeSb({
    tracks: [{ id: "t-ops", name: "Ops", column: "done", done_at: "2026-10-01T00:00:00Z" }],
  });
  assert.equal(await seedTracks(sb, ACTOR, () => {}), 4);
  assert.deepEqual(sb.db.tracks.map((t) => t.name).sort(), [...FIXED_TRACKS].sort());
  assert.equal(sb.db.tracks.find((t) => t.name === "Ops").column, "done"); // existing row untouched
  assert.ok(
    sb.db.tracks.filter((t) => t.name !== "Ops").every((t) => t.column === "now" && !t.done_at)
  );
  const before = [sb.db.tracks.length, sb.db.events.length];
  assert.equal(await seedTracks(sb, ACTOR, () => {}), 0);
  assert.deepEqual([sb.db.tracks.length, sb.db.events.length], before);
});
