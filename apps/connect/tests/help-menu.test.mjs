/** @jsxRuntime automatic */
/**
 * The header "?" menu: a popup that links to /support (and the connection guide), drawn in the signed-in
 * header, and NOT a nav item. nav.tsx and tests/nav.test.mjs are deliberately untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpMenu } from "../app/help-menu.tsx";
import { HubNav } from "../app/nav.tsx";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("the menu is a closed details whose popup links to /support and /guide", () => {
  const html = renderToStaticMarkup(createElement(HelpMenu));
  assert.match(html, /^<details class="pop pop-r hmenu"><summary aria-label="Help">\?<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /<a href="\/support">Get help<\/a>/);
  assert.match(html, /<a href="\/guide">Connection guide<\/a>/);
});

test("the header draws it inside .who, between the workspace chip and Sign out", () => {
  const layout = read("../app/layout.tsx");
  assert.match(layout, /import \{ HelpMenu \} from "\.\/help-menu";/);
  const who = layout.slice(layout.indexOf('<div className="who">'), layout.indexOf("</header>"));
  assert.ok(who.indexOf("wsc-n") < who.indexOf("<HelpMenu />"), "after the workspace chip");
  assert.ok(who.indexOf("<HelpMenu />") < who.indexOf("Sign out"), "before Sign out");
});

test("/support is not a nav item: not in HubNav for either role, nor in nav.tsx", () => {
  for (const role of ["owner", "member"]) {
    const html = renderToStaticMarkup(createElement(HubNav, { client: { name: "SB", slug: "sb", app_url: null }, role }));
    assert.doesNotMatch(html, /\/support/);
    assert.doesNotMatch(html, /Get help|>Help</);
  }
  assert.doesNotMatch(read("../app/nav.tsx"), /support/i);
});

test("the popup stays a floating popup on narrow screens (the generic .pop rule would push the header down)", () => {
  const css = read("../app/globals.css");
  assert.match(css, /@media \(max-width: 639px\) \{\s*\.hmenu\[open\] \{ display: inline-block; \}\s*\.hmenu \.pop-b \{ position: absolute;/);
});
