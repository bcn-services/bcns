// QA: static wiring of keys and server actions (no browser). Behavior is covered by the live pass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const src = (p) => readFileSync(new URL(p, root), "utf8");

test("Work keys: d done, o cycles owner, n opens the New task modal, w waiting, enter opens; no proposal keys", () => {
  const s = src("components/WorkBoard.tsx");
  assert.match(s, /d: .*markDone\(/);
  assert.match(s, /o: .*cycleOwner\(/);
  assert.match(s, /n: \(\) => setModal\(true\)/);
  assert.match(s, /w: .*"wk-waiting"/);
  assert.doesNotMatch(s, /decide|a: \(|r: \(/);
});

test("Work keys are off while the New task modal is open (no rows, no handlers, no selection change)", () => {
  const s = src("components/WorkBoard.tsx");
  const call = s.slice(s.indexOf("useRowKeys(\n"), s.indexOf("\n  );", s.indexOf("useRowKeys(\n")));
  assert.match(call, /modal \? \[\]/);
  assert.match(call, /modal \? \(\) => \{\}/);
  assert.match(call, /modal\s*\? \{\}/);
  assert.match(call, /modal \? undefined/);
});

test("Work page (v2-work A): 420px list grouped Unassigned/Nate/Brandon/Claude, filters, board with a step list per track", () => {
  const css = src("app/work.css");
  assert.match(css, /grid-template-columns: 420px minmax\(0, 1fr\)/);
  const b = src("components/WorkBoard.tsx");
  assert.match(b, /workGroups\(/);
  for (const t of ["Search", "Any track", "Any client", "+ New task", "click a step to open it"])
    assert.ok(b.includes(t), t);
  assert.match(b, /<TrackBoard board=\{board\} onStep=\{setSel\}/); // a step opens the task
  assert.match(b, /\{open \? \(\s*<WorkTaskDetail/); // an open task replaces the board
  assert.match(b, /onBack=\{\(\) => setSel\(null\)\}/);
  assert.match(b, /t\.status !== "done"/); // done tasks leave the list
  assert.match(b, /Mark done:/); // checkbox completes
  const d = src("components/WorkTaskDetail.tsx");
  for (const t of ["← Board", "✓ Done", "Save", "Waiting on", "Unassigned", "Description"])
    assert.ok(d.includes(t), t);
  assert.match(d, /track_id: s\(f, "track"\) \|\| null/);
  assert.match(d, /client_slug: s\(f, "client"\) \|\| null/);
  assert.match(src("app/(app)/work/page.tsx"), /import "\.\.\/\.\.\/work\.css"/);
});

test("New task modal: Title, Description, owner, date, track, client; Esc closes; creates with clientSlug + trackId", () => {
  const m = src("components/NewTaskModal.tsx");
  for (const t of ["New task", "Title", "Description", "Unassigned", "No track", "No client", "Create task", "Cancel"])
    assert.ok(m.includes(t), t);
  assert.match(m, /type="date"/);
  assert.match(m, /e\.key === "Escape"/);
  assert.match(m, /trackId: s\("track"\) \|\| null/);
  assert.match(m, /clientSlug: s\("client"\) \|\| null/);
  assert.match(m, /createTaskAction\(/);
});

test("TrackBoard: shared and presentational (no 'use client', no server actions), four columns from lib/tracks; Board.tsx untouched", () => {
  const t = src("components/TrackBoard.tsx");
  assert.doesNotMatch(t, /use client|actions/);
  assert.match(t, /export function TrackBoard\(/);
  assert.match(t, /COLUMNS\.map/);
  assert.match(src("lib/tracks.ts"), /done: "Done · 7 days"/);
  assert.match(src("components/TrackCard.tsx"), /export function TrackCard\(/);
});

test("work.css and the v2 components set no text under 12px", () => {
  assert.doesNotMatch(src("app/work.css"), /font-size:\s*(1[01](\.\d+)?|[0-9](\.\d+)?)px/);
});

test("Today (Nate): a/r decide, c on a fire creates the ops task but not from a task: key, d done", () => {
  const s = src("components/TodayNateBoard.tsx");
  assert.match(s, /a: \(\) => prop && decide\(prop, true\)/);
  assert.match(s, /r: \(\) => prop && decide\(prop, false\)/);
  assert.match(s, /c: \(\) => makeTask\(fire\)/);
  assert.match(s, /!f\.key\.startsWith\("task:"\)/);
  assert.match(s, /createTaskFromFire\(f\.key, f\.title\)/);
});

test("Lead rows: p / q create a Claude pitch / quote task via createTaskFromLead", () => {
  const b = src("components/TodayBrandonBoard.tsx");
  assert.match(b, /import \{ createTaskFromLead \} from "@\/app\/\(app\)\/work\/actions"/);
  assert.match(b, /\(key === "p" \|\| key === "q"\) && row\.canLog !== undefined/);
  assert.match(b, /createTaskFromLead\(row\.key, key === "p" \? "pitch" : "quote"\)/);
  assert.match(b, /<b className="k">p<\/b> pitch/);
});

test("a stale decide result is rendered as stale, not as success", () => {
  assert.match(src("components/ProposalDecide.tsx"), /r === "stale" \? "stale/);
});

test("actions: every exported server action re-checks the session; lib/tasks.ts is not a 'use server' file", () => {
  const a = src("app/(app)/work/actions.ts");
  assert.match(a, /^"use server";/);
  assert.match(a, /export async function createTaskFromLead\(/);
  assert.match(a, /export async function createTaskFromFire\(/);
  assert.match(a, /throw new Error\("not signed in"\)/);
  assert.doesNotMatch(src("lib/tasks.ts"), /use server/);
  assert.doesNotMatch(src("lib/proposals.ts"), /use server/);
  // exported action fns all go through run()/ctx()
  const exported = [...a.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  assert.ok(exported.length >= 10);
  for (const n of exported) {
    const body = a.slice(a.indexOf(`export async function ${n}(`)).split(/\nexport /)[0];
    assert.match(body, /run\(|ctx\(\)|updateTaskAction\(/, n);
  }
});

test("Today page: brandon renders TodayBrandon, everyone else TodayNate", () => {
  const p = src("app/(app)/page.tsx");
  assert.match(p, /handle === "brandon"\) return <TodayBrandon/);
  assert.match(p, /return <TodayNate \/>/);
});

test("fires-tasks seam: ops tasks due within 7 days + pending proposals; fires.ts / fires-ops.ts untouched by item 4", () => {
  const s = src("lib/fires-tasks.ts");
  assert.match(s, /\.eq\("area", "ops"\)/);
  assert.match(s, /\.neq\("status", "done"\)/);
  assert.match(s, /addDays\(today, 7\)/);
  assert.match(s, /key: `proposal:\$\{p\.id\}`/);
});
