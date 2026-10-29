/** money.test.mjs — Stripe/Mercury over a stubbed global fetch (never the real vendors), fail-soft, billing match. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const M = await import("../lib/money.ts");

const saved = { fetch: globalThis.fetch, env: { ...process.env } };
let calls;
function stub(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization });
    return handler(String(url));
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  M.clearMoneyMemo();
  process.env.MERCURY_KEY = "secret-token:test-not-real";
  process.env.STRIPE_KEY = "rk_test_not_real";
  delete process.env.MERCURY_INVOICING;
});
afterEach(() => {
  globalThis.fetch = saved.fetch;
  process.env = { ...saved.env };
});

const NOW = new Date("2026-10-27T12:00:00Z");
const mercuryApi = (url) => {
  if (url.endsWith("/accounts")) return json({ accounts: [{ id: "a1", currentBalance: 1234.5 }] });
  if (url.includes("/account/a1/transactions"))
    return json({
      transactions: [
        {
          amount: 100,
          counterpartyName: "Technology Associates LLC",
          status: "sent",
          postedAt: "2026-10-03T10:00:00Z",
        },
        {
          amount: 110,
          counterpartyName: "SAUNA BOY INC",
          status: "pending",
          createdAt: "2026-10-20T10:00:00Z",
        },
        {
          amount: -40,
          counterpartyName: "Vercel",
          status: "sent",
          postedAt: "2026-10-10T10:00:00Z",
        },
        {
          amount: 500,
          counterpartyName: "Technology Associates LLC",
          status: "failed",
          postedAt: "2026-10-25T10:00:00Z",
        },
        {
          amount: 90,
          counterpartyName: "Old Co",
          status: "sent",
          postedAt: "2026-08-01T10:00:00Z",
        },
      ],
    });
  return json({}, 404);
};

test("mercurySummary: read-only GETs with the bearer key, failed txns ignored, 30d totals", async () => {
  stub(mercuryApi);
  const s = await M.mercurySummary(NOW);
  assert.equal(M.isUnavailable(s), false);
  assert.equal(s.balanceCents, 123450);
  assert.equal(s.in30dCents, 21000); // 100 + 110; the failed 500 and the August 90 do not count
  assert.equal(s.out30dCents, 4000);
  assert.deepEqual(
    s.txns.map((t) => t.counterparty),
    ["SAUNA BOY INC", "Vercel", "Technology Associates LLC", "Old Co"]
  );
  assert.ok(calls.every((c) => c.auth === "Bearer secret-token:test-not-real"));
  assert.ok(calls.every((c) => c.url.startsWith("https://api.mercury.com/api/v1/")));
  assert.ok(
    calls.some((c) => c.url.endsWith("/accounts")) && !calls.some((c) => c.url.includes("/ar/")),
    "free route only"
  );
});

test("fail-soft: a rejected fetch gives {unavailable:true}, never a throw, and is memoised", async () => {
  stub(() => Promise.reject(new Error("network down")));
  const a = await M.mercurySummary(NOW);
  assert.equal(M.isUnavailable(a), true);
  assert.equal(M.isUnavailable(await M.stripeSummary()), true);
  const n = calls.length;
  assert.equal(M.isUnavailable(await M.mercurySummary(NOW)), true);
  assert.equal(calls.length, n, "a failure is not retried on every render");
});

test("fail-soft: an HTTP error is unavailable too", async () => {
  stub(() => json({ error: "nope", secret: "body-must-not-leak" }, 401));
  const u = await M.mercurySummary(NOW);
  assert.equal(M.isUnavailable(u), true);
  assert.match(u.error, /api\.mercury\.com\/api\/v1\/accounts 401/);
  assert.doesNotMatch(u.error, /body-must-not-leak/, "status line only, never the response body");
});

test("fail-soft: a 200 with an HTML body is a status line, and a Mercury account id never reaches the page", async () => {
  stub((url) =>
    url.endsWith("/accounts")
      ? json({ accounts: [{ id: "acct-secret-123", currentBalance: 1 }] })
      : new Response("<html>body-must-not-leak</html>", { status: 200 })
  );
  const u = await M.mercurySummary(NOW);
  assert.equal(M.isUnavailable(u), true);
  assert.match(u.error, /\/account\/…\/transactions invalid response/);
  assert.doesNotMatch(u.error, /body-must-not-leak|acct-secret-123/);
  M.clearMoneyMemo();
  stub((url) =>
    url.endsWith("/accounts")
      ? json({ accounts: [{ id: "acct-secret-123", currentBalance: 1 }] })
      : json({}, 403)
  );
  const v = await M.mercurySummary(NOW);
  assert.match(v.error, /\/account\/…\/transactions 403/);
  assert.doesNotMatch(v.error, /acct-secret-123/);
});

test("no key: unavailable without any network call", async () => {
  delete process.env.MERCURY_KEY;
  delete process.env.STRIPE_KEY;
  stub(() => json({}));
  assert.deepEqual(await M.mercurySummary(NOW), { unavailable: true });
  assert.deepEqual(await M.stripeSummary(), { unavailable: true });
  assert.equal(calls.length, 0);
});

test("a good answer is memoised for the 10-minute window", async () => {
  stub(mercuryApi);
  await M.mercurySummary(NOW);
  const n = calls.length;
  await M.mercurySummary(NOW);
  assert.equal(calls.length, n);
});

test("stripeSummary: MRR from active subscriptions, charges over 30d", async () => {
  stub((url) =>
    url.includes("/v1/subscriptions")
      ? json({
          data: [
            {
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 10000,
                      recurring: { interval: "month", interval_count: 1 },
                    },
                  },
                ],
              },
            },
            {
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 11000,
                      recurring: { interval: "month", interval_count: 1 },
                    },
                  },
                ],
              },
            },
          ],
        })
      : json({
          data: [
            { amount: 10000, paid: true, refunded: false },
            { amount: 5000, paid: false, refunded: false },
          ],
        })
  );
  const s = await M.stripeSummary();
  assert.equal(M.isUnavailable(s), false);
  assert.equal(s.activeSubscriptions, 2);
  assert.equal(s.mrrCents, 21000);
  assert.ok(calls.every((c) => c.url.startsWith("https://api.stripe.com/")));
});

test("MERCURY_INVOICING is off by default: no invoice call, even with a key", async () => {
  stub(mercuryApi);
  assert.equal(M.invoicingEnabled(), false);
  assert.deepEqual(await M.mercuryInvoices(), { unavailable: true });
  assert.equal(calls.length, 0);
});

test("MERCURY_INVOICING=1 reads invoices + customer names (paid plan)", async () => {
  process.env.MERCURY_INVOICING = "1";
  stub((url) =>
    url.includes("/ar/invoices")
      ? json({
          invoices: [
            {
              invoiceNumber: "S-0001",
              status: "Unpaid",
              amount: 100,
              dueDate: "2026-11-01",
              customerId: "c1",
            },
          ],
        })
      : json({ customers: [{ id: "c1", name: "Technology Associates" }] })
  );
  assert.equal(M.invoicingEnabled(), true);
  const inv = await M.mercuryInvoices();
  assert.deepEqual(inv, [
    {
      number: "S-0001",
      status: "Unpaid",
      amountCents: 10000,
      dueDate: "2026-11-01",
      customer: "Technology Associates",
      customerId: "c1",
    },
  ]);
});

test("a 403 from a free-plan key on invoices is unavailable, not a crash", async () => {
  process.env.MERCURY_INVOICING = "1";
  stub(() => json({ error: "plan" }, 403));
  const r = await M.mercuryInvoices();
  assert.equal(M.isUnavailable(r), true);
  assert.match(r.error, /Mercury invoicing: .* 403 .*Invoicing scope/);
});

test("a failed /ar/customers is an error with its message, not a silent empty customer list", async () => {
  process.env.MERCURY_INVOICING = "1";
  stub((url) =>
    url.includes("/ar/customers")
      ? json({ error: "scope" }, 403)
      : json({
          invoices: [
            {
              invoiceNumber: "1",
              status: "Unpaid",
              amount: 1,
              dueDate: "2026-11-01",
              customerId: "c1",
            },
          ],
        })
  );
  const r = await M.mercuryInvoices();
  assert.equal(M.isUnavailable(r), true);
  assert.match(r.error, /\/ar\/customers 403/);
});

test("no nameMatches: a client is found by alias or customer id, never by display_name", async () => {
  stub(mercuryApi);
  const { txns } = await M.mercurySummary(NOW);
  const sb = M.clientBilling(
    { display_name: "Sauna Boy", billing_note: " net 15 ", aliases: ["sauna boy inc"] },
    txns,
    null,
    "2026-10-27"
  );
  assert.equal(sb.lastPaid.amountCents, 11000);
  assert.match(sb.lastPaid.at, /^2026-10-20/);
  assert.equal(sb.mercury, true);
  assert.equal(sb.note, "net 15");
  assert.equal(sb.invoice, null);
  // no aliases: the display name alone matches nothing, even when it equals the counterparty
  const bare = M.clientBilling({ display_name: "Vercel", billing_note: null }, txns);
  assert.equal(bare.lastPaid, null);
  // exact, not contains: "technology associates" is not "Technology Associates LLC"
  const part = M.clientBilling(
    { display_name: "TA", billing_note: null, aliases: ["technology associates"] },
    txns
  );
  assert.equal(part.lastPaid, null);
  const ta = M.clientBilling(
    { display_name: "TA", billing_note: null, aliases: ["Technology Associates LLC"] },
    txns
  );
  assert.equal(ta.lastPaid.amountCents, 10000);
});

test("clientBilling ignores outgoing money; a short alias like SB matches only exactly", () => {
  const txns = [
    { at: "2026-10-01", amountCents: -5000, counterparty: "Sauna Boy", status: "sent" },
    { at: "2026-10-02", amountCents: 100, counterparty: "SB Supply", status: "sent" },
  ];
  const c = { display_name: "Sauna Boy", billing_note: null, aliases: ["Sauna Boy", "SB"] };
  assert.equal(M.clientBilling(c, txns).lastPaid, null);
  const txns2 = [
    ...txns,
    { at: "2026-10-03", amountCents: 700, counterparty: "sb", status: "sent" },
  ];
  assert.equal(M.clientBilling(c, txns2).lastPaid.amountCents, 700);
});

test("clientBilling invoices match by mercury_customer_id, alias only as the fallback", () => {
  const inv = [
    {
      number: "1",
      status: "Paid",
      amountCents: 5000,
      dueDate: "2026-10-05",
      customer: "Renamed Co",
      customerId: "c9",
    },
    {
      number: "2",
      status: "Unpaid",
      amountCents: 1,
      dueDate: "2026-10-01",
      customer: "Sauna Boy Inc",
      customerId: "c2",
    },
  ];
  const byId = M.clientBilling(
    {
      display_name: "SB",
      billing_note: null,
      mercury_customer_id: "c9",
      aliases: ["Sauna Boy Inc"],
    },
    [],
    inv,
    "2026-10-27"
  );
  assert.equal(byId.lastPaid.amountCents, 5000);
  assert.deepEqual(
    byId.invoice,
    { nextDue: null, overdue: 0 },
    "the id wins; the alias row is not mine"
  );
  const byAlias = M.clientBilling(
    { display_name: "SB", billing_note: null, aliases: ["sauna boy inc"] },
    [],
    inv,
    "2026-10-27"
  );
  assert.deepEqual(byAlias.invoice, { nextDue: null, overdue: 1 });
});

test("clientBilling with a rate: only a rate-sized payment counts, one-time invoices do not", () => {
  const c = {
    display_name: "TA",
    billing_note: null,
    monthly_rate_cents: 10000,
    mercury_customer_id: "c1",
    aliases: ["Technology Associates LLC"],
  };
  const paid = (number, amountCents, dueDate) => ({
    number,
    status: "Paid",
    amountCents,
    dueDate,
    customer: "Technology Associates LLC",
    customerId: "c1",
  });
  // one-time $250 consult paid this month, no rate-sized payment: not the monthly payment
  const oneOff = M.clientBilling(c, [], [paid("INV-1", 25000, "2026-10-05")], "2026-10-29");
  assert.equal(oneOff.lastPaid, null);
  // rate-sized invoice fallback counts, and wins over a newer one-off
  const rated = M.clientBilling(
    c,
    [],
    [paid("INV-1", 25000, "2026-10-05"), paid("INV-2", 10000, "2026-09-01")],
    "2026-10-29"
  );
  assert.deepEqual(rated.lastPaid, { at: "2026-09-01", amountCents: 10000 });
  // rate-sized txn counts; a bigger one-off txn is skipped
  const txns = [
    {
      at: "2026-10-05",
      amountCents: 25000,
      counterparty: "Technology Associates LLC",
      status: "sent",
    },
    {
      at: "2026-10-01",
      amountCents: 10000,
      counterparty: "Technology Associates LLC",
      status: "sent",
    },
  ];
  assert.equal(M.clientBilling(c, txns).lastPaid.at, "2026-10-01");
});

test("clientBilling with Mercury unavailable keeps the note and says so", () => {
  const b = M.clientBilling(
    { display_name: "Sauna Boy", billing_note: "pays by check" },
    { unavailable: true }
  );
  assert.deepEqual(b, { mercury: false, lastPaid: null, invoice: null, note: "pays by check" });
});

test("clientBilling invoices: next due and overdue count, only when supplied", () => {
  const inv = [
    {
      number: "1",
      status: "Unpaid",
      amountCents: 1,
      dueDate: "2026-10-01",
      customer: "Sauna Boy Inc",
    },
    {
      number: "2",
      status: "Unpaid",
      amountCents: 1,
      dueDate: "2026-11-05",
      customer: "Sauna Boy Inc",
    },
    {
      number: "3",
      status: "Paid",
      amountCents: 1,
      dueDate: "2026-09-01",
      customer: "Sauna Boy Inc",
    },
    { number: "4", status: "Unpaid", amountCents: 1, dueDate: "2026-10-01", customer: "Other" },
  ];
  const b = M.clientBilling(
    { display_name: "Sauna Boy", billing_note: null, aliases: ["Sauna Boy Inc"] },
    [],
    inv,
    "2026-10-27"
  );
  assert.deepEqual(b.invoice, { nextDue: "2026-11-05", overdue: 1 });
});

// --- MRR ---------------------------------------------------------------------------------------

const sub = (id, amount, extra = {}) => ({
  id,
  created: 1_760_000_000,
  items: {
    data: [
      {
        quantity: 1,
        price: { unit_amount: amount, recurring: { interval: "month", interval_count: 1 } },
      },
    ],
  },
  ...extra,
});

test("mrr: Stripe active subs minus cancel_at_period_end, plus Mercury per-client rates", async () => {
  stub((url) =>
    url.includes("/v1/subscriptions")
      ? json({
          data: [
            sub("sub_a", 10000),
            sub("sub_b", 4000, { cancel_at_period_end: true, cancel_at: 1_793_000_000 }),
          ],
        })
      : json({ data: [] })
  );
  const stripe = await M.stripeSummary();
  const clients = [
    { monthly_rate_cents: 20000, billing_source: "mercury", churn_date: null },
    { monthly_rate_cents: 5000, billing_source: "mercury", churn_date: "2026-09-01" }, // churned
    { monthly_rate_cents: 7000, billing_source: "stripe", churn_date: null }, // counted via Stripe
    { monthly_rate_cents: 9000, billing_source: "none", churn_date: null },
    { monthly_rate_cents: null, billing_source: "mercury", churn_date: null },
  ];
  const r = M.mrr(stripe, clients);
  assert.equal(r.stripe, 10000);
  assert.equal(r.mercury, 20000);
  assert.equal(r.total, 30000);
  assert.deepEqual(r.excluded, [{ id: "sub_b", cancelAt: "2026-10-26" }]);
});

test("mrr: a sub with cancel_at set but cancel_at_period_end false is excluded with its cancel_at", async () => {
  stub((url) =>
    url.includes("/v1/subscriptions")
      ? json({
          data: [
            sub("sub_a", 10000),
            sub("sub_c", 4000, { cancel_at_period_end: false, cancel_at: 1_793_000_000 }),
          ],
        })
      : json({ data: [] })
  );
  const r = M.mrr(await M.stripeSummary(), []);
  assert.equal(r.stripe, 10000);
  assert.deepEqual(r.excluded, [{ id: "sub_c", cancelAt: "2026-10-26" }]);
});

test("mrr: a Stripe outage counts as $0 and lists nothing excluded; Mercury rates still add", () => {
  const r = M.mrr({ unavailable: true, error: "x" }, [
    { monthly_rate_cents: 100, billing_source: "mercury" },
  ]);
  assert.deepEqual(r, { total: 100, stripe: 0, mercury: 100, excluded: [] });
});

test("mrrSeries counts a cancelling Stripe sub in the weeks before its cancel date, not after", () => {
  const stripe = {
    mrrCents: 0,
    activeSubscriptions: 1,
    charges30dCents: 0,
    subs: [
      { id: "s", mrrCents: 4000, created: 1_760_000_000, cancelling: true, cancelAt: "2026-10-22" },
    ],
    excluded: [{ id: "s", cancelAt: "2026-10-22" }],
  };
  assert.deepEqual(
    M.mrrSeries(["2026-10-05", "2026-10-12", "2026-10-19"], stripe, []),
    [4000, 4000, 0]
  );
});

test("mrrSeries rebuilds weekly MRR from launch and churn dates; mercuryWeeks buckets cash and flows", () => {
  const weeks = ["2026-10-12", "2026-10-19", "2026-10-26"];
  const clients = [
    {
      monthly_rate_cents: 100,
      billing_source: "mercury",
      launch_date: "2026-10-20",
      churn_date: null,
    },
    {
      monthly_rate_cents: 50,
      billing_source: "mercury",
      launch_date: "2026-01-01",
      churn_date: "2026-10-22",
    },
  ];
  assert.deepEqual(M.mrrSeries(weeks, { unavailable: true }, clients), [50, 100, 100]);
  const m = {
    balanceCents: 1000,
    txns: [
      { at: "2026-10-27T10:00:00Z", amountCents: 300, counterparty: "x", status: "sent" },
      { at: "2026-10-21T10:00:00Z", amountCents: -100, counterparty: "y", status: "sent" },
    ],
  };
  const w = M.mercuryWeeks(weeks, m);
  assert.deepEqual(w.inflow, [0, 0, 300]);
  assert.deepEqual(w.burn, [0, 100, 0]);
  assert.deepEqual(w.cash, [800, 700, 1000]);
});
