import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/site-header.tsx", import.meta.url), "utf8");
const anchors = [...src.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

test("Sign in renders as an outline button in both header variants", () => {
  const signIn = anchors.filter((a) => a.includes("siteConfig.signIn.href"));
  assert.equal(signIn.length, 2);
  for (const a of signIn) {
    assert.match(a, /rel="noopener"/);
    for (const c of ["lift-button", "rounded-lg", "border-border", "bg-transparent", "text-foreground", "focus-visible:ring-2"])
      assert.ok(a.includes(c), `missing ${c}`);
  }
  assert.ok(!/fetch\(/.test(src));
});
