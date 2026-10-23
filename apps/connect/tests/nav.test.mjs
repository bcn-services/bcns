/**
 * Hub nav, rendered to static markup with a plain client row (the real caller
 * loads it through the session). /data is reached only from "Your data"; the
 * Dashboard link exists only with app_url.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HubNav } from "../app/nav.tsx";

const SB = { name: "SB", slug: "sb", app_url: "https://sb.bcn-services.com" };
const PLAIN = { name: "Shopify Review", slug: "shopify-review", app_url: null };
const render = (el, props) => renderToStaticMarkup(createElement(el, props));

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
    const html = render(HubNav, { client, role: "owner" });
    assert.equal(html.match(/href="\/data"/g)?.length, 1);
  }
});
