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
  for (const t of ["← Board", "✓ Done", "Save", "Waiting on", "Description"])
    assert.ok(d.includes(t), t);
  assert.match(d, /<OwnerChecks defaultValue=\{task\.owners\}/); // owners are checkboxes
  assert.match(d, /assertOwners\(f\.getAll\("owner"\)\)/);
  assert.match(d, /track_id: s\(f, "track"\) \|\| null/);
  assert.match(d, /client_slug: s\(f, "client"\) \|\| null/);
  assert.match(src("app/(app)/work/page.tsx"), /import "\.\.\/\.\.\/work\.css"/);
});

test("New task modal: Title, Description, owner, date, track, client; Esc closes; creates with clientSlug + trackId", () => {
  const m = src("components/NewTaskModal.tsx");
  for (const t of [
    "New task",
    "Title",
    "Description",
    "No track",
    "No client",
    "Create task",
    "Cancel",
  ])
    assert.ok(m.includes(t), t);
  assert.match(m, /<OwnerChecks \/>/); // nothing ticked = unassigned
  assert.match(m, /owners: assertOwners\(f\.getAll\("owner"\)\)/);
  assert.match(src("components/OwnerChecks.tsx"), /Unassigned/);
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

test("QA fix-round-2: filter selects are fixed at the prototype's 93px; Save cannot null a client slug that has no clients row", () => {
  assert.match(src("app/work.css"), /\.wk-filters select \{\s*flex: 0 0 93px/);
  const d = src("components/WorkTaskDetail.tsx");
  assert.match(d, /task\.client_slug && !clients\.some\(\(c\) => c\.slug === task\.client_slug\)/);
  assert.match(d, /<option value=\{task\.client_slug\}>/);
});

test("Today (Nate) matches Work: same 420px split, a selected task or board step opens WorkTaskDetail on the right, board = todayQueue for the signed-in handle", () => {
  const css = src("app/globals.css");
  assert.match(css, /\.td-lay \{[^}]*grid-template-columns: 420px minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.td-lay \{\s*grid-template-columns: 340px/); // no narrow override Work lacks
  const b = src("components/TodayNateBoard.tsx");
  assert.match(b, /sel === `t:\$\{t\.id\}`/); // a board step selects its task
  assert.match(b, /\{task \? \(\s*<WorkTaskDetail/); // which replaces the board
  assert.match(b, /onBack=\{\(\) => setSel\(null\)\}/);
  assert.match(b, /<TrackBoard board=\{board\} onStep=\{\(id\) => setSel\(`t:\$\{id\}`\)\}/);
  const n = src("components/TodayNate.tsx");
  assert.match(n, /todayQueue\([\s\S]*?\bme,\s*today\s*\)/);
  assert.match(b, /Nothing up\. Add a task or assign yourself one on Work\./); // empty state
  assert.match(n, /!t\.track_id \|\| shownTracks\.has\(t\.track_id\)/); // tasks on a skipped (non-fixed) track take no queue slots
  assert.match(n, /const me = profile\.handle/);
  assert.match(n, /filter\(\(card\) => card\.steps\.length\)/); // empty tracks drop off Today
  // Work and Today load the detail data through one loader
  assert.match(src("app/(app)/work/page.tsx"), /loadWorkData\(sb\)/);
  assert.match(n, /loadWorkData\(sb\)/);
});

test("Numbers funnel: bars scale to the largest stage, so a stage above Calls cannot overflow the card", () => {
  const v = src("app/(app)/numbers/View.tsx");
  assert.match(v, /const top = Math\.max\(1, \.\.\.steps\.map\(\(\[, v\]\) => last\(v\)\)\)/);
  assert.doesNotMatch(v, /const top = last\(calls\)/);
});

test("ticket tasks: the Resolution textarea shows only for alert_key ticket:*, and Done sends it in the same patch as status done", () => {
  const d = src("components/WorkTaskDetail.tsx");
  assert.match(d, /const isTicket = !!task\.alert_key\?\.startsWith\("ticket:"\)/);
  assert.match(d, /\{isTicket \? \(\s*<>\s*<textarea\s+key=\{[^}]*\}\s+name="resolution"/); // rendered only when gated
  assert.equal(d.split('name="resolution"').length, 2, "one resolution textarea, inside the gate");
  assert.ok(d.includes("Sent to the client's ticket when this task is done. Saved when you leave the box or press Done."));
  assert.ok(d.includes("Already sent if the ticket has synced; later edits are not pushed.")); // shown once done
  assert.match(d, /\{done\s*\? "Already sent/);
  assert.match(d, /updateTaskAction\(task\.id, \{ status: "done", resolution: res \|\| null \}\)/); // Done: one patch
});

test("ticket resolution: Save and Done send it only when the textarea changed (a stale open detail cannot blank an MCP-set one); leaving the box saves it", () => {
  const d = src("components/WorkTaskDetail.tsx");
  assert.match(d, /const resChanged = \(v: string\) => v\.trim\(\) !== \(task\.resolution \?\? ""\)/);
  assert.match(d, /isTicket && resChanged\(s\(f, "resolution"\)\)\s*\? \{ resolution: s\(f, "resolution"\) \|\| null \}\s*: \{\}/); // Save
  assert.match(d, /const res = typed !== null && resChanged\(typed\) \? typed : null/); // Done: unchanged -> markDone
  assert.match(d, /res === null\s*\? await markDone\(task\.id\)/);
  assert.match(d, /onBlur=\{async \(e\) => \{[\s\S]*?updateTaskAction\(task\.id, \{ resolution: v\.trim\(\) \|\| null \}\)/); // d key closes with the typed text
  assert.doesNotMatch(d, /\$\{task\.resolution\}/); // the blur save must not remount the whole form (it would eat a Done click)
});

test("Today (Nate): a Connect ticket fire ops:ticket:<id> is hidden when the job-owned task ticket:platform:<id> is open", () => {
  const t = src("components/TodayNate.tsx");
  assert.match(t, /key\.replace\(\/\^ops:ticket:\/, "ticket:platform:"\)/);
  assert.match(t, /!isTaken\(f\.key\)/);
});
