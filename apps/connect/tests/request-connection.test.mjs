/**
 * "Request connection" must degrade, never fail: RESEND_API_KEY is unset in
 * every local run and every CI build, and a member still has to get through.
 * fetch is injected so the Resend payload is asserted without a network call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BCNS_EMAIL,
  RESEND_ENDPOINT,
  buildEmail,
  mailtoLink,
  requestConnection,
} from "../lib/request-connection.ts";

const REQUEST = {
  clientName: "Acme Detailing",
  clientSlug: "acme",
  source: "shopify",
  requesterEmail: "owner@acme.example",
};

function recorder(response) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response;
    },
  };
}

test("no RESEND_API_KEY: nothing is sent, a mailto is offered, the payload is logged", async () => {
  const { calls, fetchImpl } = recorder(new Response("", { status: 200 }));
  const lines = [];
  const outcome = await requestConnection(REQUEST, { fetchImpl, log: (l) => lines.push(l) });

  assert.equal(outcome.sent, false);
  assert.equal(calls.length, 0, "must not call Resend without a key");
  assert.ok(outcome.mailto.startsWith(`mailto:${BCNS_EMAIL}?`));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("acme") && lines[0].includes("shopify"));
});

test("with a key: one POST to Resend carrying client, slug, source and requester", async () => {
  const { calls, fetchImpl } = recorder(new Response("{}", { status: 200 }));
  const outcome = await requestConnection(REQUEST, { apiKey: "re_test", fetchImpl, log: () => {} });

  assert.deepEqual(outcome, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RESEND_ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, [BCNS_EMAIL]);
  assert.equal(body.reply_to, "owner@acme.example");
  assert.ok(body.subject.includes("shopify") && body.subject.includes("Acme Detailing"));
  assert.ok(body.text.includes("acme") && body.text.includes("shopify"));
});

test("a Resend rejection still leaves the member a way through", async () => {
  const { fetchImpl } = recorder(new Response("nope", { status: 422 }));
  const outcome = await requestConnection(REQUEST, { apiKey: "re_test", fetchImpl, log: () => {} });
  assert.equal(outcome.sent, false);
  assert.ok(outcome.mailto.includes("shopify"));
});

test("a network failure is not an error the member sees", async () => {
  const outcome = await requestConnection(REQUEST, {
    apiKey: "re_test",
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
    log: () => {},
  });
  assert.equal(outcome.sent, false);
  assert.ok(outcome.mailto.length > 0);
});

test("an anonymous requester is allowed and carries no reply_to", () => {
  const email = buildEmail({ ...REQUEST, requesterEmail: null });
  assert.equal(email.reply_to, undefined);
  assert.ok(email.text.includes("unknown"));
  assert.ok(mailtoLink({ ...REQUEST, requesterEmail: null }).includes("subject="));
});
