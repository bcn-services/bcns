import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, createFetchPage } from "../lib/fetch-page.mjs";

const pub = async () => [{ address: "93.184.216.34" }];
const res = (over = {}) => ({
  ok: true,
  status: 200,
  headers: new Map(),
  text: async () => "hello",
  ...over,
});

test("blocks non-http schemes, IP literals and local names without resolving", async () => {
  let looked = 0;
  const lookup = async () => {
    looked++;
    return [{ address: "93.184.216.34" }];
  };
  for (const u of [
    "file:///etc/passwd",
    "ftp://a.example.invalid/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest",
    "http://localhost/",
    "http://x.localhost/",
    "http://db.internal/",
    "http://printer.local/",
  ])
    await assert.rejects(assertPublicUrl(u, lookup), /blocked/, u);
  assert.equal(looked, 0);
});

test("blocks a public-looking name that resolves private, link-local or loopback", async () => {
  for (const address of [
    "10.0.0.5",
    "192.168.1.9",
    "172.16.0.1",
    "169.254.169.254",
    "127.0.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ]) {
    await assert.rejects(
      assertPublicUrl("https://a.example.invalid/", async () => [{ address }]),
      /blocked/,
      address
    );
  }
  await assert.rejects(
    assertPublicUrl("https://a.example.invalid/", async () => [
      { address: "93.184.216.34" },
      { address: "10.0.0.5" },
    ]),
    /blocked/
  );
  await assertPublicUrl("https://a.example.invalid/", pub);
});

test("fetches a public page and returns its text", async () => {
  const f = createFetchPage({ lookup: pub, fetchImpl: async () => res() });
  assert.equal(await f("https://a.example.invalid/"), "hello");
});

test("a redirect to a private host is blocked on the hop, the private host is never fetched", async () => {
  const seen = [];
  const f = createFetchPage({
    lookup: async (h) => [{ address: h === "evil.example.invalid" ? "10.0.0.1" : "93.184.216.34" }],
    fetchImpl: async (u) => {
      seen.push(u);
      return res({
        status: 302,
        ok: false,
        headers: new Map([["location", "https://evil.example.invalid/x"]]),
      });
    },
  });
  await assert.rejects(f("https://a.example.invalid/"), /blocked host/);
  assert.deepEqual(seen, ["https://a.example.invalid/"]);
});

test("relative redirects resolve and are followed; more than the limit throws", async () => {
  let n = 0;
  const f = createFetchPage({
    lookup: pub,
    maxRedirects: 3,
    fetchImpl: async () => {
      n++;
      return res({ status: 301, ok: false, headers: new Map([["location", "/next"]]) });
    },
  });
  await assert.rejects(f("https://a.example.invalid/"), /redirected more than 3/);
  assert.equal(n, 4);

  const urls = [];
  const ok = createFetchPage({
    lookup: pub,
    fetchImpl: async (u) => {
      urls.push(u);
      return urls.length === 1
        ? res({ status: 301, ok: false, headers: new Map([["location", "/about"]]) })
        : res();
    },
  });
  await ok("https://a.example.invalid/");
  assert.equal(urls[1], "https://a.example.invalid/about");
});

test("a non-2xx answer throws", async () => {
  const f = createFetchPage({
    lookup: pub,
    fetchImpl: async () => res({ ok: false, status: 404 }),
  });
  await assert.rejects(f("https://a.example.invalid/"), /404/);
});

test("the body is capped at maxBytes (text fallback)", async () => {
  const f = createFetchPage({
    lookup: pub,
    maxBytes: 10,
    fetchImpl: async () => res({ text: async () => "x".repeat(100) }),
  });
  assert.equal((await f("https://a.example.invalid/")).length, 10);
});

test("a streamed body stops being read at the cap", async () => {
  let reads = 0;
  let cancelled = false;
  const body = {
    getReader: () => ({
      read: async () => {
        reads++;
        return { done: false, value: Buffer.from("y".repeat(8)) };
      },
      cancel: async () => {
        cancelled = true;
      },
    }),
  };
  const f = createFetchPage({ lookup: pub, maxBytes: 20, fetchImpl: async () => res({ body }) });
  const out = await f("https://a.example.invalid/");
  assert.equal(out.length, 20);
  assert.equal(reads, 3);
  assert.ok(cancelled);
});

test("the request carries a timeout signal and does not auto-follow redirects", async () => {
  let init;
  const f = createFetchPage({
    lookup: pub,
    fetchImpl: async (_u, i) => {
      init = i;
      return res();
    },
  });
  await f("https://a.example.invalid/");
  assert.equal(init.redirect, "manual");
  assert.ok(init.signal instanceof AbortSignal);
});
