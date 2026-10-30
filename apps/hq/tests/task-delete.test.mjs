/** task-delete.test.mjs — deleteTask: admin only; removes notes, links, then the task, and logs it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSb } from "./_fake-sb.mjs";

const { deleteTask } = await import("../lib/tasks.ts");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const seed = () => ({
  tasks: [
    { id: "t1", title: "Demo" },
    { id: "t2", title: "Keep" },
  ],
  notes: [
    { id: "n1", task_id: "t1" },
    { id: "n2", task_id: "t2" },
  ],
  links: [{ id: "l1", task_id: "t1" }],
});
const withRole = (sb, admin) =>
  Object.assign(sb, { rpc: async () => ({ data: admin, error: null }) });

test("member is refused and nothing is deleted", async () => {
  const sb = withRole(fakeSb(seed()), false);
  await assert.rejects(deleteTask(sb, ACTOR, "ui", "t1"), /admin/);
  assert.equal(sb.db.tasks.length, 2);
  assert.equal(sb.db.notes.length, 2);
});

test("admin deletes the task with its notes and links, leaves others, logs an event", async () => {
  const sb = withRole(fakeSb(seed()), true);
  await deleteTask(sb, ACTOR, "ui", "t1");
  assert.deepEqual(
    sb.db.tasks.map((t) => t.id),
    ["t2"]
  );
  assert.deepEqual(
    sb.db.notes.map((n) => n.id),
    ["n2"]
  );
  assert.equal(sb.db.links.length, 0);
  assert.equal(sb.db.events[0].kind, "task.deleted");
  await assert.rejects(deleteTask(sb, ACTOR, "ui", "t1"), /not found/);
});
