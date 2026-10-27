// A page fetch for qualify, with the ends capped: a deadline (which also
// bounds the body read), a byte ceiling on what is read, and a short redirect chain. The URL comes from a
// third-party listing (Places), so every hop is checked against the droplet's
// own network: http(s) only, no IP literals, no host that resolves to a
// loopback / private / link-local address (cloud metadata lives there).
// ponytail: resolve-then-fetch leaves a DNS-rebinding gap; pin the resolved
// address in a custom agent if untrusted-site volume ever warrants it.

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
const isPrivateAddr = (a) => {
  const x = a.toLowerCase().replace(/^::ffff:/, "");
  return (
    PRIVATE_V4.test(x) || x === "::1" || x === "::" || /^f[cd]/.test(x) || x.startsWith("fe80")
  );
};

export async function assertPublicUrl(url, lookup = dnsLookup) {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new Error(`blocked scheme ${u.protocol}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (
    isIP(host) ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error(`blocked host ${host}`);
  }
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddr(a.address)))
    throw new Error(`blocked host ${host}`);
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
  fetchImpl = fetch,
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
      if (!res.ok) throw new Error(`fetch ${url} returned ${res.status}`);
      return readCapped(res, maxBytes);
    }
    throw new Error(`fetch ${url} redirected more than ${maxRedirects} times`);
  };
}
