// A3 ADR content-presence check. Run: node --test docs/architecture/__tests__/hosted-web-model.check.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const adr = fileURLToPath(new URL("../hosted-web-model.md", import.meta.url));
const t = readFileSync(adr, "utf8");

const required = [
  "$1,000", "$149", "$3,000", "$349", "$20", "15", "Part II",
  "Coolify", "Hetzner", "Cloudflare", "Neon", "Clerk", "Stripe",
  "@bcns/app-core", "templates/hosted-web",
];

for (const s of required) {
  test(`ADR mentions "${s}"`, () => {
    assert.ok(t.includes(s), `missing required string: ${s}`);
  });
}

test("ADR reverses/supersedes the Part II monorepo decision", () => {
  assert.ok(/revers|supersede/i.test(t), "no reversal/supersede language");
  assert.ok(t.includes("Part II"), "no Part II reference");
});

test("ADR lists at least two risk/mitigation entries", () => {
  const sec = t.split("Risks & mitigations")[1]?.split("### Repo model")[0] ?? "";
  const rows = sec
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && !l.includes("---") && /\*\*/.test(l) && !/\|\s*Risk\s*\|/.test(l));
  assert.ok(rows.length >= 2, `expected >=2 risk rows, got ${rows.length}`);
});

test("ADR is valid-ish Markdown (H1 + balanced code fences)", () => {
  assert.ok(t.startsWith("# "), "does not start with an H1");
  assert.equal(t.split("```").length % 2, 1, "unbalanced code fences");
});
