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
  assert.deepEqual(await M.mercurySummary(NOW), { unavailable: true });
  assert.deepEqual(await M.stripeSummary(), { unavailable: true });
  const n = calls.length;
  assert.deepEqual(await M.mercurySummary(NOW), { unavailable: true });
  assert.equal(calls.length, n, "a failure is not retried on every render");
});

test("fail-soft: an HTTP error is unavailable too", async () => {
  stub(() => json({ error: "nope" }, 401));
  assert.deepEqual(await M.mercurySummary(NOW), { unavailable: true });
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
    },
  ]);
});

test("a 403 from a free-plan key on invoices is unavailable, not a crash", async () => {
  process.env.MERCURY_INVOICING = "1";
  stub(() => json({ error: "plan" }, 403));
  assert.deepEqual(await M.mercuryInvoices(), { unavailable: true });
});

test("clientBilling: last incoming transaction whose counterparty contains the client name, any case", async () => {
  stub(mercuryApi);
  const { txns } = await M.mercurySummary(NOW);
  const sb = M.clientBilling(
    { display_name: "Sauna Boy", billing_note: " net 15 " },
    txns,
    null,
    "2026-10-27"
  );
  assert.equal(sb.lastPaid.amountCents, 11000);
  assert.match(sb.lastPaid.at, /^2026-10-20/);
  assert.equal(sb.mercury, true);
  assert.equal(sb.note, "net 15");
  assert.equal(sb.invoice, null);
  const ta = M.clientBilling({ display_name: "technology associates", billing_note: null }, txns);
  assert.equal(ta.lastPaid.amountCents, 10000);
  const none = M.clientBilling({ display_name: "Nobody Here", billing_note: null }, txns);
  assert.equal(none.lastPaid, null);
});

test("clientBilling ignores outgoing money and names shorter than 3 characters", () => {
  const txns = [
    { at: "2026-10-01", amountCents: -5000, counterparty: "Sauna Boy refund", status: "sent" },
    { at: "2026-10-02", amountCents: 100, counterparty: "SB Supply", status: "sent" },
  ];
  assert.equal(
    M.clientBilling({ display_name: "Sauna Boy", billing_note: null }, txns).lastPaid,
    null
  );
  assert.equal(M.clientBilling({ display_name: "SB", billing_note: null }, txns).lastPaid, null);
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
    { display_name: "Sauna Boy", billing_note: null },
    [],
    inv,
    "2026-10-27"
  );
  assert.deepEqual(b.invoice, { nextDue: "2026-11-05", overdue: 1 });
});
