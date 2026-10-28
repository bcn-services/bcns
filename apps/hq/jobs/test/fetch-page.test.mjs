import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  assertPublicUrl,
  createFetchPage,
  guardedLookup,
  isBlockedHostname,
  isPrivateAddr,
  pinnedFetch,
} from "../lib/fetch-page.mjs";

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

// --- address classes: one test each ----------------------------------------

const blocked = (list) => {
  for (const a of list) assert.equal(isPrivateAddr(a), true, a);
};

test("class: loopback 127/8 and ::1 are blocked", () => blocked(["127.0.0.1", "127.255.255.254", "::1", "0:0:0:0:0:0:0:1"]));
test("class: RFC1918 10/8, 172.16/12, 192.168/16 are blocked (and the edges outside are not)", () => {
  blocked(["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1"]);
  assert.equal(isPrivateAddr("172.32.0.1"), false);
  assert.equal(isPrivateAddr("172.15.0.1"), false);
});
test("class: link-local 169.254/16 (cloud metadata) and fe80::/10 are blocked", () =>
  blocked(["169.254.169.254", "169.254.0.1", "fe80::1", "febf::1"]));
test("class: CGNAT 100.64/10 is blocked, 100.63 and 100.128 are not", () => {
  blocked(["100.64.0.1", "100.100.100.200", "100.127.255.255"]);
  assert.equal(isPrivateAddr("100.63.0.1"), false);
  assert.equal(isPrivateAddr("100.128.0.1"), false);
});
test("class: 0/8 and the unspecified address are blocked", () => blocked(["0.0.0.0", "0.1.2.3", "::"]));
test("class: benchmarking 198.18/15 is blocked, 198.20 is not", () => {
  blocked(["198.18.0.1", "198.19.255.255"]);
  assert.equal(isPrivateAddr("198.20.0.1"), false);
});
test("class: multicast 224/4 and reserved 240/4 (incl. broadcast) are blocked", () =>
  blocked(["224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255"]));
test("class: unique-local fc00::/7 and multicast ff00::/8 are blocked", () =>
  blocked(["fc00::1", "fd12:3456::1", "ff02::1"]));
test("class: IPv4-mapped IPv6, dotted and hex spellings, follows the v4 rules", () => {
  blocked(["::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::FFFF:7F00:0001", "0:0:0:0:0:ffff:a00:1", "::ffff:a9fe:a9fe"]);
  assert.equal(isPrivateAddr("::ffff:93.184.216.34"), false);
  assert.equal(isPrivateAddr("::ffff:5db8:d822"), false);
});
test("class: NAT64 64:ff9b::/96 is blocked", () => blocked(["64:ff9b::7f00:1", "64:ff9b::a00:1", "64:ff9b::808:808"]));
test("class: v4-compatible ::/96, 6to4, Teredo and documentation v6 are blocked", () =>
  blocked(["::7f00:1", "2002:7f00:1::1", "2001::1", "2001:db8::1"]));
test("a malformed or zone-id address fails closed", () => blocked(["not-an-ip", "fe80::1%eth0", ""]));
test("ordinary public addresses pass", () => {
  for (const a of ["93.184.216.34", "8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4001::200e"])
    assert.equal(isPrivateAddr(a), false, a);
});

test("class: localhost, .localhost, .internal, .local, bare names and metadata hosts are blocked", async () => {
  for (const h of [
    "localhost", "LOCALHOST", "localhost.", "a.localhost", "db.internal", "metadata.google.internal",
    "METADATA.GOOGLE.INTERNAL.", "x.local", "metadata", "instance-data", "metadata.goog", "intranet",
  ])
    assert.equal(isBlockedHostname(h), true, h);
  for (const u of [
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:7f00:1]/",
    "http://[64:ff9b::7f00:1]/",
    "http://2130706433/", // decimal 127.0.0.1, normalised by URL
    "http://0x7f.1/",
  ])
    await assert.rejects(assertPublicUrl(u, async () => assert.fail("must not resolve")), /blocked/, u);
  assert.equal(isBlockedHostname("example.com"), false);
});

// --- connect-time check (the rebinding gap) ---------------------------------

const cbResolver = (addrs) => (_h, _o, cb) => cb(null, addrs);

test("guardedLookup: every resolved address is checked, one private among public blocks", async () => {
  const run = (addrs, opts = {}) =>
    new Promise((res) => guardedLookup(cbResolver(addrs))("a.example.invalid", opts, (...r) => res(r)));
  const [e1] = await run([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]);
  assert.match(e1.message, /blocked host/);
  const [e2] = await run([{ address: "::ffff:7f00:1", family: 6 }]);
  assert.match(e2.message, /blocked host/);
  const [e3] = await run([]);
  assert.match(e3.message, /blocked host/);
  assert.deepEqual(await run([{ address: "93.184.216.34", family: 4 }]), [null, "93.184.216.34", 4]);
  assert.deepEqual(await run([{ address: "93.184.216.34", family: 4 }], { all: true }), [null, [{ address: "93.184.216.34", family: 4 }]]);
});

function server(handler) {
  let hits = 0;
  const srv = http.createServer((req, res) => {
    hits++;
    handler(req, res);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, port: srv.address().port, hits: () => hits })));
}

test("rebinding: the pre-check sees a public answer, the connect-time answer is loopback: no connection is made", async () => {
  const s = await server((_q, res) => res.end("secret"));
  try {
    const f = createFetchPage({
      lookup: pub, // first resolution: public
      fetchImpl: pinnedFetch(guardedLookup(cbResolver([{ address: "127.0.0.1", family: 4 }]))), // second: rebound
    });
    await assert.rejects(f(`http://rebind.example.invalid:${s.port}/`), /blocked host/);
    assert.equal(s.hits(), 0);
  } finally {
    s.srv.close();
  }
});

test("pinnedFetch connects to the validated address and streams the body through the cap", async () => {
  const s = await server((_q, res) => res.end("x".repeat(100)));
  try {
    const f = createFetchPage({
      lookup: pub,
      maxBytes: 10,
      fetchImpl: pinnedFetch(guardedLookup(cbResolver([{ address: "127.0.0.1", family: 4 }]), () => false)),
    });
    assert.equal(await f(`http://ok.example.invalid:${s.port}/`), "x".repeat(10));
    assert.equal(s.hits(), 1);
  } finally {
    s.srv.close();
  }
});

test("pinnedFetch hands redirects back unfollowed (the caller re-checks each hop)", async () => {
  const s = await server((_q, res) => {
    res.writeHead(302, { location: "http://evil.example.invalid/" });
    res.end();
  });
  try {
    const r = await pinnedFetch(guardedLookup(cbResolver([{ address: "127.0.0.1", family: 4 }]), () => false))(
      `http://ok.example.invalid:${s.port}/`
    );
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "http://evil.example.invalid/");
    assert.equal(s.hits(), 1);
  } finally {
    s.srv.close();
  }
});
