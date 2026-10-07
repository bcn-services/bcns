// SEO structure: titles, sitemap coverage, JSON-LD shape, llms.txt.
// Run: node --experimental-strip-types --test __tests__/seo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteContent } from "../lib/content.ts";
import { siteJsonLd, serviceJsonLd, parsePrice, llmsTxt } from "../lib/seo.ts";
import sitemap from "../app/sitemap.ts";

const { pageMeta, pastWork, pricing } = siteContent;
const tier = (id) => pricing.tiers.find((t) => t.id === id);

test("templated titles don't repeat the site name", () => {
  for (const key of ["services", "work", "pricing", "deluxe", "aiConsulting"]) {
    assert.doesNotMatch(pageMeta[key].title, /\|\s*bcns$/, key);
  }
});

test("page descriptions fit in 155 chars", () => {
  for (const [key, { description }] of Object.entries(pageMeta)) {
    assert.ok(description.length <= 155, `${key}: ${description.length}`);
  }
});

test("sitemap lists every case study", () => {
  const urls = sitemap().map((e) => e.url);
  for (const { slug } of pastWork.items) {
    assert.ok(urls.some((u) => u.endsWith(`/work/${slug}`)), slug);
  }
  assert.equal(new Set(urls).size, urls.length, "no duplicate URLs");
});

const roundTrip = (x) => JSON.parse(JSON.stringify(x));

test("site JSON-LD parses as Organization + WebSite", () => {
  const graph = roundTrip(siteJsonLd())["@graph"];
  assert.deepEqual(graph.map((n) => n["@type"]), ["Organization", "WebSite"]);
  assert.deepEqual(
    graph[0].founder.map((p) => p.name),
    siteContent.about.founders.map((f) => f.name),
  );
});

test("service JSON-LD prices come from pricing.tiers", () => {
  const connect = roundTrip(serviceJsonLd("connect"));
  const consulting = roundTrip(serviceJsonLd("consulting"));
  const deluxe = roundTrip(serviceJsonLd("deluxe"));
  for (const s of [connect, consulting, deluxe]) assert.equal(s["@type"], "Service");
  assert.equal(connect.offers.priceSpecification.price, parsePrice(tier("connect").price));
  assert.equal(consulting.offers.priceSpecification.price, parsePrice(tier("consulting").price));
  assert.deepEqual(
    deluxe.offers.priceSpecification.map((p) => p.minPrice),
    [parsePrice(tier("deluxe").setup), parsePrice(tier("deluxe").monthly)],
  );
  assert.equal(connect.offers.priceSpecification.price, 200);
});

test("parsePrice throws on text with no dollar amount", () => {
  assert.throws(() => parsePrice("Contact us"));
});

test("llms.txt names every service and case study", () => {
  const txt = llmsTxt();
  for (const t of pricing.tiers) assert.ok(txt.includes(t.name), t.name);
  for (const { slug } of pastWork.items) assert.ok(txt.includes(`/work/${slug}`), slug);
});
