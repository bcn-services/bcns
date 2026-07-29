// A3 ADR content-presence check. Run: node --test docs/architecture/__tests__/hosted-web-model.check.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const adr = fileURLToPath(new URL("../hosted-web-model.md", import.meta.url));
const t = readFileSync(adr, "utf8");

// Pricing/seat terms and the current hosting stack. These previously pinned
// "Coolify", "Hetzner", "Neon" and "Clerk" -- the pre-revision stack -- which
// made the test actively enforce the drift it was meant to catch. The stack of
// record is ~/os/knowledge/library/bcns/hosting-reference.md.
const required = [
  "$1,000", "$149", "$3,000", "$349", "$20", "15", "Part II",
  "DigitalOcean", "Cloudflare", "Supabase", "Stripe",
  "@nseluga/app-core",
];

// Retired stack choices must not reappear as if current. The revision note is
// allowed to name them, so this checks only prose outside that blockquote.
const retired = ["Coolify", "Hetzner", "Neon Postgres", "Clerk"];

for (const s of required) {
  test(`ADR mentions "${s}"`, () => {
    assert.ok(t.includes(s), `missing required string: ${s}`);
  });
}

for (const s of retired) {
  test(`ADR does not present retired choice "${s}" as current`, () => {
    const prose = t
      .split("\n")
      .filter((l) => !l.trim().startsWith(">"))
      .join("\n");
    assert.ok(!prose.includes(s), `retired stack choice outside revision note: ${s}`);
  });
}

test("ADR records that the hosting stack was revised", () => {
  assert.ok(/Revised July 2026/.test(t), "no revision note on the hosting stack");
});

test("ADR does not link the removed hosted-web template as if it exists", () => {
  assert.ok(
    !t.includes("](../../templates/hosted-web/)"),
    "links templates/hosted-web/, which was deleted in 79221e1",
  );
});

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
