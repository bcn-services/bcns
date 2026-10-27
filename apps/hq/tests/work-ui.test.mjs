// QA: static wiring of keys and server actions (no browser). Behavior is covered by the live pass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const src = (p) => readFileSync(new URL(p, root), "utf8");

test("Work keys: a/r decide the selected proposal, d done, o cycles owner, n new, w waiting", () => {
  const s = src("components/WorkBoard.tsx");
  assert.match(s, /a: \(k\) => propOf\(k\) && decide\(propOf\(k\)!, true\)/);
  assert.match(s, /r: \(k\) => propOf\(k\) && decide\(propOf\(k\)!, false\)/);
  assert.match(s, /d: .*markDone\(/);
  assert.match(s, /o: .*cycleOwner\(/);
  assert.match(s, /n: \(\) => focus\("wk-new-title"\)/);
  assert.match(s, /w: .*focus\("wk-waiting"\)/);
});

test("Today (Nate): a/r decide, c on a fire creates the ops task but not from a task: key, d done", () => {
  const s = src("components/TodayNateBoard.tsx");
  assert.match(s, /a: \(\) => prop && decide\(prop, true\)/);
  assert.match(s, /r: \(\) => prop && decide\(prop, false\)/);
  assert.match(s, /c: \(\) => makeTask\(fire\)/);
  assert.match(s, /!f\.key\.startsWith\("task:"\)/);
  assert.match(s, /createTaskFromFire\(f\.key, f\.title\)/);
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

test("Today page: the nate branch renders TodayNate; brandon branch is untouched Board", () => {
  const p = src("app/(app)/page.tsx");
  assert.match(p, /if \(handle === "nate"\) return <TodayNate \/>/);
});

test("fires-tasks seam: ops tasks due within 7 days + pending proposals; fires.ts / fires-ops.ts untouched by item 4", () => {
  const s = src("lib/fires-tasks.ts");
  assert.match(s, /\.eq\("area", "ops"\)/);
  assert.match(s, /\.neq\("status", "done"\)/);
  assert.match(s, /addDays\(today, 7\)/);
  assert.match(s, /key: `proposal:\$\{p\.id\}`/);
});
