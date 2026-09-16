/**
 * matcher.test.mjs — every app's `config.matcher` literal must equal
 * TENANT_MATCHER.
 *
 * Next statically extracts `config.matcher` at build time and cannot follow an
 * imported identifier, so each app inlines the pattern. That duplication is
 * only safe if something fails when the copies drift: this reads the app files
 * as TEXT (never imports them — Next's edge modules don't load under node) and
 * compares the extracted literal to the exported constant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TENANT_MATCHER } from "../src/middleware.ts";

const appsDir = fileURLToPath(new URL("../../../apps/", import.meta.url));
const APPS = ["sb", "_template"];

/** The array literal assigned to `matcher:` in a middleware file. */
function matcherLiteral(source) {
  const match = source.match(/matcher:\s*(\[[^\]]*\])/);
  assert.ok(match, "no `matcher: [...]` literal found");
  return JSON.parse(match[1].replace(/,\s*\]$/, "]"));
}

test("every app middleware inlines exactly TENANT_MATCHER", () => {
  let checked = 0;
  for (const app of APPS) {
    const file = `${appsDir}${app}/middleware.ts`;
    if (!existsSync(file)) continue;
    assert.deepEqual(
      matcherLiteral(readFileSync(file, "utf8")),
      TENANT_MATCHER,
      `apps/${app}/middleware.ts matcher has drifted from TENANT_MATCHER`
    );
    checked += 1;
  }
  assert.ok(checked >= 1, "no app middleware found to check");
});
