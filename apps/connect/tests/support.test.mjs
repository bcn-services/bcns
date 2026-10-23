/**
 * /support: the ticket is recorded FIRST, then emailed. Pins the Resend payload (literals, not the
 * module's own constants), the no-key / failed-send fallbacks (row kept, mailto offered), header
 * injection, the form limits, the history row (subject, status, date), and that /support is gated.
 * Pure: the api and fetch are fakes shaped like supabase-js's rpc() result; no Next, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BODY_MAX,
  SUBJECT_MAX,
  createTicket,
  errorFlag,
  oneLine,
  parseTicketForm,
  replyToAddress,
  ticketEmail,
  ticketMailto,
} from "../lib/support.ts";
import { SupportView } from "../app/support/view.tsx";

const ID = "5b1c7d0e-3f0a-4b8e-9a52-0d6f1c2e4a77";
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const GOOD = { subject: "Sync is stuck", body: "Shopify stopped syncing.\nSince Monday.", severity: "urgent" };

/** An api whose rpc() answers like PostgREST for `returns table (id, client_slug)`. */
function fakeApi(result = { data: [{ id: ID, client_slug: "acme" }], error: null }) {
  const calls = [];
  return { calls, api: { rpc: async (fn, args) => (calls.push({ fn, args }), result) } };
}
function fakeFetch(response) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      if (response instanceof Error) throw response;
      calls.push({ url, init });
      return response;
    },
  };
}
const deps = (extra) => ({ requesterEmail: "dana@acme.example", clientName: "Acme Sauna", log: () => {}, ...extra });

test("saved and emailed: one RPC with only the three fields, then Resend to Nate with Reply-To = the user", async () => {
  const { api, calls: rpc } = fakeApi();
  const { fetchImpl, calls } = fakeFetch(new Response("{}", { status: 200 }));
  const to = await createTicket(form(GOOD), deps({ api, apiKey: "re_test", fetchImpl }));

  assert.equal(to, "/support?sent=1");
  assert.equal(rpc.length, 1);
  assert.equal(rpc[0].fn, "ticket_create");
  assert.deepEqual(rpc[0].args, { p_subject: "Sync is stuck", p_body: "Shopify stopped syncing.\nSince Monday.", p_severity: "urgent" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  const mail = JSON.parse(calls[0].init.body);
  assert.deepEqual(mail.to, ["nseluga@bcn-services.com"]);
  assert.equal(mail.from, "bcns Connect <connect@bcn-services.com>");
  assert.equal(mail.reply_to, "dana@acme.example");
  assert.equal(mail.subject, "[Connect ticket acme] Sync is stuck");
  assert.match(mail.text, /^Severity: urgent$/m);
  assert.match(mail.text, /^Workspace: Acme Sauna \(acme\)$/m);
  assert.match(mail.text, new RegExp(`^Ticket: ${ID}$`, "m"));
  assert.match(mail.text, /Shopify stopped syncing\.\nSince Monday\./);
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
});

test("no RESEND_API_KEY: the row is kept, nothing is fetched, the page gets the ticket id for a mailto", async () => {
  const { api, calls: rpc } = fakeApi();
  const { fetchImpl, calls } = fakeFetch(new Response("{}", { status: 200 }));
  const lines = [];
  const to = await createTicket(form(GOOD), deps({ api, fetchImpl, log: (l) => lines.push(l) }));

  assert.equal(to, `/support?sent=mailto&t=${ID}`);
  assert.equal(rpc.length, 1, "the row was written");
  assert.equal(calls.length, 0, "no key, no call");
  assert.ok(!lines.join("\n").includes("Shopify stopped"), "the log never carries the body");
});

test("failed send (Resend 500, then an unreachable Resend): the row is kept and the user is told", async () => {
  for (const response of [new Response("no", { status: 500 }), new Error("ECONNRESET")]) {
    const { api, calls: rpc } = fakeApi();
    const { fetchImpl } = fakeFetch(response);
    const to = await createTicket(form(GOOD), deps({ api, apiKey: "re_test", fetchImpl }));
    assert.equal(to, `/support?sent=failed&t=${ID}`);
    assert.equal(rpc.length, 1);
  }
});

test("a rejected RPC sends nothing: rate limit, validation and anything else map to a flag", async () => {
  const cases = [
    [{ code: "BCNS9", message: "rate_limited" }, "rate"],
    [{ code: "BCNS3", message: "validation", details: "subject" }, "subject"],
    [{ code: "BCNS3", message: "validation", details: "weird" }, "failed"],
    [{ code: "BCNS0", message: "no_tenant" }, "failed"],
    [{ code: "42501", message: "denied" }, "failed"],
  ];
  for (const [error, flag] of cases) {
    const { api } = fakeApi({ data: null, error });
    const { fetchImpl, calls } = fakeFetch(new Response("{}", { status: 200 }));
    assert.equal(await createTicket(form(GOOD), deps({ api, apiKey: "re_test", fetchImpl })), `/support?error=${flag}`);
    assert.equal(calls.length, 0, "no email for a ticket that was not saved");
  }
  const thrower = { rpc: async () => { throw new Error("boom"); } };
  assert.equal(await createTicket(form(GOOD), deps({ api: thrower, apiKey: "k" })), "/support?error=failed");
  const odd = fakeApi({ data: [], error: null });
  assert.equal(await createTicket(form(GOOD), deps({ api: odd.api, apiKey: "k" })), "/support?error=failed");
  assert.equal(errorFlag({ code: "BCNS9" }), "rate");
});

test("form limits are the database's: 120 / 4000, severity from a fixed list, nothing reaches the RPC when wrong", async () => {
  assert.equal(SUBJECT_MAX, 120);
  assert.equal(BODY_MAX, 4000);
  const bad = [
    [{ ...GOOD, subject: "   " }, "subject"],
    [{ ...GOOD, subject: "x".repeat(121) }, "subject"],
    [{ ...GOOD, body: "" }, "body"],
    [{ ...GOOD, body: "x".repeat(4001) }, "body"],
    [{ ...GOOD, severity: "critical" }, "severity"],
  ];
  for (const [fields, field] of bad) {
    const { api, calls } = fakeApi();
    assert.equal(await createTicket(form(fields), deps({ api, apiKey: "k" })), `/support?error=${field}`);
    assert.equal(calls.length, 0);
  }
  assert.ok(!("field" in parseTicketForm(form({ subject: "x".repeat(120), body: "y".repeat(4000), severity: "low" }))));
  assert.equal(parseTicketForm(form({ subject: "s", body: "b" })).severity, "normal", "severity defaults to normal");
  assert.equal(parseTicketForm(new FormData()).field, "subject");
});

test("header injection: a newline in the subject or a hostile account email never reaches a header", async () => {
  assert.equal(oneLine("a\r\nBcc: evil@x.com\tz"), "a Bcc: evil@x.com z");
  assert.equal(parseTicketForm(form({ ...GOOD, subject: "hi\r\nBcc: evil@x.com" })).subject, "hi Bcc: evil@x.com");

  const { api } = fakeApi();
  const { fetchImpl, calls } = fakeFetch(new Response("{}", { status: 200 }));
  await createTicket(form({ ...GOOD, subject: "hi\r\nBcc: evil@x.com" }), deps({ api, apiKey: "k", fetchImpl, requesterEmail: "a@b.com\r\nBcc: evil@x.com" }));
  const mail = JSON.parse(calls[0].init.body);
  assert.ok(!/[\r\n]/.test(mail.subject), "no newline in the subject");
  assert.equal(mail.subject, "[Connect ticket acme] hi Bcc: evil@x.com");
  assert.equal(mail.reply_to, undefined, "a malformed account email is dropped, not repaired");

  for (const bad of ["a b@c.com", "a@b.com,c@d.com", "<a@b.com>", '"a"@b.com', "a@b.com\n", " a@b.com", "", null]) {
    assert.equal(replyToAddress(bad), null, String(bad));
  }
  assert.equal(replyToAddress("dana@acme.example"), "dana@acme.example");

  // The slug and workspace name are database values, but they sit in the subject and body all the same.
  const email = ticketEmail({ id: ID, subject: "s", body: "b", severity: "low", clientSlug: "ac\nme", clientName: "A\r\nB", requesterEmail: null });
  assert.equal(email.subject, "[Connect ticket ac me] s");
  assert.equal(ticketEmail({ id: ID, subject: "x\r\nBcc: e@x.com", body: "b", severity: "low", clientSlug: "acme", clientName: null, requesterEmail: null }).subject, "[Connect ticket acme] x Bcc: e@x.com", "builder is safe on its own");
  assert.match(email.text, /^Workspace: A B \(ac me\)$/m);
  assert.equal(email.reply_to, undefined);
});

test("mailto: to Nate, same subject, percent-encoded (no + for spaces), body capped, ticket id inside", () => {
  const link = ticketMailto({ id: ID, subject: "Sync is stuck", body: "b".repeat(5000), severity: "urgent", clientSlug: "acme", clientName: "Acme Sauna", requesterEmail: "dana@acme.example" });
  assert.ok(link.startsWith("mailto:nseluga@bcn-services.com?subject="));
  const url = new URL(link);
  assert.equal(url.searchParams.get("subject"), "[Connect ticket acme] Sync is stuck");
  assert.ok(!link.includes("+"), "spaces are %20");
  assert.match(url.searchParams.get("body"), new RegExp(`Ticket: ${ID}`));
  assert.ok(url.searchParams.get("body").length < 1700, "capped so mail apps do not cut the URL");
});

const render = (props) =>
  renderToStaticMarkup(createElement(SupportView, { tickets: [], mailto: null, action: () => {}, ...props }));

test("page: a form with subject, body and a three-way severity select defaulting to normal", () => {
  const html = render({});
  assert.match(html, /<input id="tk-subject" name="subject"[^>]*maxLength="120"|<input id="tk-subject" name="subject"[^>]*maxlength="120"/i);
  assert.match(html, /<textarea id="tk-body" name="body"[^>]*maxLength="4000"/i);
  assert.equal(html.match(/<option /g)?.length, 3);
  for (const v of ["low", "normal", "urgent"]) assert.match(html, new RegExp(`<option value="${v}"`));
  assert.match(html, /<select id="tk-severity" name="severity"/);
  assert.match(html, /Nothing yet\./);
});

test("history: subject, status and date per row; a closed and an answered ticket read differently", () => {
  const html = render({
    timezone: "America/New_York",
    tickets: [
      { id: ID, subject: "Sync is stuck", body: "b", severity: "urgent", status: "answered", created_at: "2026-10-22T03:30:00Z" },
      { id: "6b1c7d0e-3f0a-4b8e-9a52-0d6f1c2e4a77", subject: "Old <b>question</b>", body: "b", severity: "low", status: "open", created_at: "2026-09-01T15:00:00Z" },
    ],
  });
  assert.match(html, /Sync is stuck<\/span><span class="st st-ok">Answered<\/span><time[^>]*>2026-10-21<\/time>/, "date is in the workspace timezone");
  assert.match(html, /<span class="st">Open<\/span><time[^>]*>2026-09-01<\/time>/);
  assert.match(html, /Old &lt;b&gt;question&lt;\/b&gt;/, "subject is escaped");
  assert.doesNotMatch(html, /Nothing yet/);
});

test("banners: sent, no key and failed send each say so; the last two carry the mailto button", () => {
  assert.match(render({ sent: "1" }), /Sent\. We&#x27;ll reply by email\./);
  const mailto = "mailto:nseluga@bcn-services.com?subject=x";
  const noKey = render({ sent: "mailto", mailto });
  assert.match(noKey, /saved, but this server can&#x27;t send email/);
  assert.match(noKey, /href="mailto:nseluga@bcn-services\.com\?subject=x"/);
  const failed = render({ sent: "failed", mailto });
  assert.match(failed, /saved, but the email to bcns didn&#x27;t go out/);
  assert.match(failed, /Email bcns/);
  assert.match(render({ sent: "failed", mailto: null }), /Email nseluga@bcn-services\.com so we see it/);
  assert.match(render({ error: "rate" }), /role="alert"[^>]*>That&#x27;s a lot of tickets/);
  assert.match(render({ error: "nonsense" }), /That didn&#x27;t save/);
  assert.match(render({ historyFailed: true }), /couldn&#x27;t load your tickets/);
});

test("/support is a signed-in route: the middleware matcher runs on it, and the page and action re-check the membership", () => {
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const m = mw.match(/matcher:\s*\["([^"]+)"\]/);
  assert.ok(m, "matcher literal not found");
  const re = new RegExp(`^${m[1]}$`);
  assert.ok(re.test("/support"));
  assert.ok(!re.test("/api/health"), "sanity: the matcher does exclude public routes");

  const page = readFileSync(new URL("../app/support/page.tsx", import.meta.url), "utf8");
  assert.match(page, /await requireHub\(\)/);
  const action = readFileSync(new URL("../app/support/actions.ts", import.meta.url), "utf8");
  assert.match(action, /await requireHub\(\)/);
  assert.match(action, /apiKey: getConfig\(\)\.resendApiKey/);
});

test("the Send button is a client component that disables while the action is pending", () => {
  const src = readFileSync(new URL("../app/support/send-button.tsx", import.meta.url), "utf8");
  assert.match(src, /^"use client";/);
  assert.match(src, /useFormStatus/);
  assert.match(src, /disabled=\{pending\}/);
  const html = renderToStaticMarkup(createElement(SupportView, { tickets: [], mailto: null, action: () => {} }));
  assert.match(html, /<button type="submit" class="btn"[^>]*>Send<\/button>/);
  assert.doesNotMatch(html, /<button[^>]* disabled/);
});
