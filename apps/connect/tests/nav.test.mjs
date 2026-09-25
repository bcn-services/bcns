/**
 * Hub nav and the home page's dashboard button, rendered to static markup with a
 * plain client row (the real caller loads it through the session). /data is
 * reached only from "Your data"; the dashboard link/button exist only with app_url.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardButton, HubNav } from "../app/nav.tsx";

const SB = { name: "SB", slug: "sb", app_url: "https://sb.bcn-services.com" };
const PLAIN = { name: "Shopify Review", slug: "shopify-review", app_url: null };
const render = (el, props) => renderToStaticMarkup(createElement(el, props));

test("home: no dashboard button without app_url", () => {
  assert.equal(render(DashboardButton, { client: PLAIN }), "");
  assert.equal(render(DashboardButton, { client: { slug: "acme" } }), "");
  assert.equal(render(DashboardButton, { client: null }), "");
});

test("home: the button goes to app_url when set", () => {
  const html = render(DashboardButton, { client: SB });
  assert.match(html, /Open your dashboard/);
  assert.match(html, /href="https:\/\/sb\.bcn-services\.com"/);
  assert.doesNotMatch(html, /href="\/data"/);
  assert.doesNotMatch(html, /target=/, "same tab");
});

test("top bar: 'Dashboard' only when app_url is set, 'Your data' always", () => {
  const plain = render(HubNav, { client: PLAIN, role: "owner" });
  assert.doesNotMatch(plain, />Dashboard</);
  assert.match(plain, /href="\/data"[^>]*>Your data</);

  const sb = render(HubNav, { client: SB, role: "member" });
  assert.match(sb, /href="https:\/\/sb\.bcn-services\.com"[^>]*>Dashboard</);
  assert.match(sb, /href="\/data"[^>]*>Your data</);
  assert.doesNotMatch(sb, /target=/, "same tab");
  assert.doesNotMatch(sb, />Access</, "Access stays owner-only");
});

test("/data is linked exactly once, from the top bar", () => {
  for (const client of [SB, PLAIN, null]) {
    const html = render(HubNav, { client, role: "owner" }) + render(DashboardButton, { client });
    assert.equal(html.match(/href="\/data"/g)?.length, 1);
  }
});
