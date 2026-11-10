import { test } from "node:test";
import assert from "node:assert/strict";
import { run, message, nudgeDeps, TODAY_URL, FROM } from "../nudge.mjs";
import { main } from "../run.mjs";

const PII = ["Acme Plumbing", "555-867-5309", "owner@acme.example"];

// Answers by statement text. The business rows carry PII to prove it never reaches the mail.
function setup({ waiting = 7, fresh = 3, already = false } = {}) {
  const events = [];
  const seen = [];
  const sql = async (strings) => {
    const t = strings.join("?").replace(/\s+/g, " ");
    seen.push(t);
    if (t.includes("from events")) return already ? [{ "?column?": 1 }] : [];
    if (t.includes("from businesses"))
      return Object.assign([{ count: waiting }], { name: PII[0], phone: PII[1], email: PII[2] });
    throw new Error(`unexpected sql: ${t}`);
  };
  const db = {
    promotedToday: async () => [{ count: fresh, name: PII[0], phone: PII[1], email: PII[2] }],
    logEvent: async (_s, job, kind, detail) => void events.push({ job, kind, detail }),
  };
  const calls = [];
  const ok = async (url, opts) => (calls.push({ url, opts }), { status: 200 });
  return { sql, db, events, calls, ok, seen };
}
const base = { apiKey: "key-123", to: "someone@example.test" };

test("message: counts sentence and the link, singular handled", () => {
  assert.deepEqual(message({ waiting: 12, fresh: 4 }), {
    subject: "12 calls waiting, 4 new today",
    text: `12 calls waiting, 4 new today\n\n${TODAY_URL}\n`,
  });
  assert.equal(message({ waiting: 1, fresh: 0 }).subject, "1 call waiting, 0 new today");
});

test("sends once: Resend payload is counts + link only, event holds counts only", async () => {
  const s = setup();
  const out = await run({ sql: s.sql, db: s.db, ...base, fetch: s.ok });
  assert.deepEqual(out, { sent: true, waiting: 7, fresh: 3 });
  const [{ url, opts }] = s.calls;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(opts.method, "POST");
  assert.equal(opts.headers.Authorization, "Bearer key-123");
  assert.ok(opts.signal);
  const body = JSON.parse(opts.body);
  assert.deepEqual(body, { from: FROM, to: [base.to], ...message({ waiting: 7, fresh: 3 }) });
  for (const p of PII) assert.ok(!opts.body.includes(p));
  assert.deepEqual(s.events, [{ job: "nudge", kind: "sent", detail: { waiting: 7, fresh: 3 } }]);
  assert.ok(
    !JSON.stringify([out, s.events]).includes(base.to),
    "recipient never returned or logged"
  );
});

// The fake never runs a WHERE clause, so the filters are pinned as text.
test("queries: Brandon's unsuppressed call_due rows; a sent event since UTC midnight", async () => {
  const s = setup();
  await run({ sql: s.sql, db: s.db, ...base, fetch: s.ok });
  const [sentQ, countQ] = s.seen;
  for (const part of [
    "from events",
    "job = 'nudge'",
    "kind = 'sent'",
    "created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'",
  ])
    assert.ok(sentQ.includes(part), `already-sent query lost: ${part}`);
  for (const part of [
    "from businesses",
    "stage = 'call_due'",
    "suppressed_at is null",
    "assigned_to = 'brandon'",
  ])
    assert.ok(countQ.includes(part), `count query lost: ${part}`);
  assert.match(s.calls[0].opts.headers["Idempotency-Key"], /^nudge-\d{4}-\d{2}-\d{2}$/);
});

test("nothing waiting: no fetch, no event", async () => {
  const s = setup({ waiting: 0 });
  assert.deepEqual(await run({ sql: s.sql, db: s.db, ...base, fetch: s.ok }), {
    sent: false,
    waiting: 0,
  });
  assert.equal(s.calls.length + s.events.length, 0);
});

test("already sent today: skipped", async () => {
  const s = setup({ already: true });
  assert.deepEqual(await run({ sql: s.sql, db: s.db, ...base, fetch: s.ok }), {
    sent: false,
    reason: "already sent",
  });
  assert.equal(s.calls.length + s.events.length, 0);
});

test("dry run: logs the text, sends nothing, writes no event", async () => {
  const s = setup();
  const log = console.log;
  const lines = [];
  console.log = (x) => lines.push(x);
  try {
    const out = await run({ sql: s.sql, db: s.db, dryRun: true, fetch: s.ok });
    assert.deepEqual(out, { sent: false, dryRun: true, waiting: 7, fresh: 3 });
  } finally {
    console.log = log;
  }
  assert.match(lines.join(), /7 calls waiting, 3 new today/);
  assert.equal(s.calls.length + s.events.length, 0);
});

test("Resend non-2xx throws with the status, no key or recipient, and logs no sent event", async () => {
  const s = setup();
  const bad = async () => ({ status: 422 });
  await assert.rejects(run({ sql: s.sql, db: s.db, ...base, fetch: bad }), (e) => {
    assert.match(e.message, /422/);
    assert.ok(!e.message.includes("key-123") && !e.message.includes(base.to));
    return true;
  });
  const down = async () => {
    throw new Error(`boom ${base.to}`);
  };
  await assert.rejects(
    run({ sql: s.sql, db: s.db, ...base, fetch: down }),
    (e) => !e.message.includes(base.to)
  );
  assert.equal(s.events.length, 0);
});

test("nudgeDeps: needs key and to unless dry run", () => {
  assert.throws(() => nudgeDeps({ NUDGE_TO: "x" }), /RESEND_API_KEY/);
  assert.throws(() => nudgeDeps({ RESEND_API_KEY: "k" }), /NUDGE_TO/);
  assert.deepEqual(nudgeDeps({ RESEND_API_KEY: "k", NUDGE_TO: "x" }), {
    apiKey: "k",
    to: "x",
    dryRun: false,
  });
  assert.equal(nudgeDeps({ NUDGE_DRY_RUN: "1" }).dryRun, true);
});

test("run.mjs nudge dispatches and writes a run row", async () => {
  const s = setup();
  const code = await main({
    argv: ["nudge"],
    env: { DATABASE_URL: "unused", RESEND_API_KEY: "k", NUDGE_TO: "x" },
    deps: { sql: Object.assign(s.sql, { end: async () => {} }), db: s.db, job: { fetch: s.ok } },
  });
  assert.equal(code, 0);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(
    s.events.map((e) => e.kind),
    ["sent", "run"]
  );
});
