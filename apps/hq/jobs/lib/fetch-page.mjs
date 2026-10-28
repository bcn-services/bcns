// A page fetch for qualify, with the ends capped: a deadline (which also
// bounds the body read), a byte ceiling on what is read, and a short redirect chain. The URL comes from a
// third-party listing (Places), so every hop is checked against the droplet's
// own network: http(s) only, no IP literals, no host that resolves to a
// loopback / private / link-local / reserved address (cloud metadata lives there).
//
// Two layers. assertPublicUrl resolves and checks the name up front (cheap, and
// the test seam). The default fetch then connects through guardedLookup, which
// validates every address AT CONNECT TIME and hands the socket only addresses
// that passed, so a name that rebinds between the check and the connect (or
// answers differently the second time) cannot reach a private address.

import { lookup as dnsLookup } from "node:dns/promises";
import { lookup as dnsLookupCb } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const V4_BLOCKED = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];
const v4n = (s) => s.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const V4_RANGES = V4_BLOCKED.map(([a, bits]) => [v4n(a) / 2 ** (32 - bits), bits]);
const blockedV4 = (a) => V4_RANGES.some(([base, bits]) => Math.floor(v4n(a) / 2 ** (32 - bits)) === Math.floor(base));

// URL normalises every IPv6 spelling (zero runs, case, dotted tails such as
// ::ffff:127.0.0.1 -> ::ffff:7f00:1) so one hex form is all that is parsed.
function groups6(addr) {
  const h = new URL(`http://[${addr}]/`).hostname.slice(1, -1);
  const [head, tail] = h.split("::");
  const hs = head ? head.split(":") : [];
  const ts = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array(8 - hs.length - ts.length).fill("0");
  return [...hs, ...fill, ...ts].map((x) => parseInt(x, 16));
}

// Unparseable means blocked: this fails closed.
export function isPrivateAddr(addr) {
  try {
    if (isIP(addr) === 4) return blockedV4(addr);
    const g = groups6(addr);
    if (g.length !== 8 || g.some(Number.isNaN)) return true;
    const low96zero = g.slice(0, 6).every((x) => x === 0);
    if (low96zero) return true; // ::, ::1, ::/96 (v4-compatible)
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      return blockedV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`); // v4-mapped, any spelling
    }
    return (
      (g[0] === 0x64 && g[1] === 0xff9b) || // NAT64 64:ff9b::/96 (and its local-use /48)
      (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local
      (g[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local
      (g[0] & 0xff00) === 0xff00 || // ff00::/8 multicast
      (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) || // 100::/64 discard
      (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) || // Teredo, documentation
      g[0] === 0x2002 // 6to4 embeds a v4 address
    );
  } catch {
    return true;
  }
}

const BLOCKED_NAMES = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
]);
export function isBlockedHostname(raw) {
  const host = raw.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return (
    isIP(host) !== 0 || // literals are never fetched; names only
    !host.includes(".") || // bare names resolve through the host's search domain
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    BLOCKED_NAMES.has(host)
  );
}

export async function assertPublicUrl(url, lookup = dnsLookup) {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new Error(`blocked scheme ${u.protocol}`);
  const host = u.hostname;
  if (isBlockedHostname(host)) throw new Error(`blocked host ${host}`);
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddr(a.address)))
    throw new Error(`blocked host ${host}`);
}

// A node:net `lookup` option: resolves, checks EVERY address, and only then
// lets the socket connect, so what is checked is what is used.
export function guardedLookup(resolve = dnsLookupCb, blocked = isPrivateAddr) {
  return (hostname, options, cb) => {
    if (typeof options === "function") [cb, options] = [options, {}];
    resolve(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs.length || addrs.some((a) => blocked(a.address)))
        return cb(new Error(`blocked host ${hostname}`));
      return options.all ? cb(null, addrs) : cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

// fetch-shaped GET on node:http(s) with the guarded lookup. No redirects are
// followed (the caller re-checks each hop), the body is a web stream.
export function pinnedFetch(lookup = guardedLookup()) {
  return (url, { signal, headers } = {}) =>
    new Promise((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(u, { lookup, signal, headers, agent: false, method: "GET" }, (res) => {
        const status = res.statusCode ?? 0;
        const redirect = status >= 300 && status < 400;
        if (redirect) res.destroy();
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: {
            get: (k) => {
              const v = res.headers[k.toLowerCase()];
              return Array.isArray(v) ? v.join(", ") : (v ?? null);
            },
          },
          body: redirect ? null : Readable.toWeb(res),
        });
      });
      req.on("error", reject);
      req.end();
    });
}

// Stop reading at the cap instead of buffering a hostile multi-GB body.
async function readCapped(res, maxBytes) {
  if (!res.body?.getReader) {
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  while (n < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
}

export function createFetchPage({
  fetchImpl = pinnedFetch(),
  lookup = dnsLookup,
  timeoutMs = 10_000,
  maxBytes = 512 * 1024,
  maxRedirects = 3,
} = {}) {
  return async function fetchPage(url) {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertPublicUrl(current, lookup);
      const res = await fetchImpl(current, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual",
        headers: { "user-agent": "bcns-hq/1.0" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers?.get?.("location")) {
        current = new URL(res.headers.get("location"), current).href;
        continue;
      }
      if (!res.ok) {
        res.body?.cancel?.()?.catch?.(() => {});
        throw new Error(`fetch ${url} returned ${res.status}`);
      }
      return readCapped(res, maxBytes);
    }
    throw new Error(`fetch ${url} redirected more than ${maxRedirects} times`);
  };
}
