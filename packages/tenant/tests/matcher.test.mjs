/**
 * matcher.test.mjs — every app's `config.matcher` literal must equal
 * TENANT_MATCHER, plus that app's named allowlist of extra exclusions (only
 * connect has one: CONNECT_PUBLIC_ROUTES). Any other drift fails.
 *
 * Next statically extracts `config.matcher` at build time and cannot follow an
 * imported identifier, so each app inlines the pattern. That duplication is
 * only safe if something fails when the copies drift: this reads the app files
 * as TEXT (never imports them — Next's edge modules don't load under node) and
 * compares the extracted literal to the exported constant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TENANT_MATCHER, CONNECT_PUBLIC_ROUTES } from "../src/middleware.ts";

const appsDir = fileURLToPath(new URL("../../../apps/", import.meta.url));
// Every app with a middleware.ts, so a stamped app is checked too (web has none).
const APPS = readdirSync(appsDir).filter((d) => existsSync(`${appsDir}${d}/middleware.ts`));
assert.ok(APPS.includes("sb") && APPS.includes("_template"), `expected sb and _template in ${APPS}`);

/** Per-app extra exclusions; an app not listed gets exactly TENANT_MATCHER. */
const APP_PUBLIC_ROUTES = { connect: CONNECT_PUBLIC_ROUTES };

/** TENANT_MATCHER with `extra` spliced in right after the health route. */
function expectedMatcher(extra = []) {
  if (extra.length === 0) return TENANT_MATCHER;
  const anchor = "api/health$|";
  assert.ok(TENANT_MATCHER[0].includes(anchor), `TENANT_MATCHER lost its ${anchor} anchor`);
  return [TENANT_MATCHER[0].replace(anchor, `${anchor}${extra.join("|")}|`)];
}

/** The array literal assigned to `matcher:` in a middleware file. */
function matcherLiteral(source) {
  const match = source.match(/matcher:\s*(\[[^\]]*\])/);
  assert.ok(match, "no `matcher: [...]` literal found");
  return JSON.parse(match[1].replace(/,\s*\]$/, "]"));
}

test("every app middleware inlines exactly TENANT_MATCHER plus its allowlist", () => {
  let checked = 0;
  for (const app of APPS) {
    const file = `${appsDir}${app}/middleware.ts`;
    if (!existsSync(file)) continue;
    assert.deepEqual(
      matcherLiteral(readFileSync(file, "utf8")),
      expectedMatcher(APP_PUBLIC_ROUTES[app]),
      `apps/${app}/middleware.ts matcher has drifted from TENANT_MATCHER + its allowlist`
    );
    checked += 1;
  }
  assert.ok(checked >= 1, "no app middleware found to check");
});
