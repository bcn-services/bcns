// Instruction-file size cap. Run: node --test docs/architecture/__tests__/instruction-size-cap.check.mjs
// Every CLAUDE.md and .claude/rules/*.md loads into context, so each stays small.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const MAX_LINES = 200;
const MAX_WORDS = 1500;

// Tracked + untracked-but-not-ignored files, so node_modules, .next and worktrees drop out via .gitignore.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((f) => /(^|\/)CLAUDE\.md$/.test(f) || /^\.claude\/rules\/.+\.md$/.test(f));

test("instruction files were found", () => {
  assert.ok(files.includes("CLAUDE.md"), "root CLAUDE.md not found");
  assert.ok(files.some((f) => f.startsWith(".claude/rules/")), "no .claude/rules/*.md found");
});

for (const f of files) {
  test(`${f} is within the size cap`, () => {
    const text = readFileSync(root + f, "utf8");
    const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    const words = text.split(/\s+/).filter(Boolean).length;
    const hint = "At the cap, merge or delete a line before adding one.";
    assert.ok(lines <= MAX_LINES, `${f} has ${lines} lines (max ${MAX_LINES}). ${hint}`);
    assert.ok(words <= MAX_WORDS, `${f} has ${words} words (max ${MAX_WORDS}). ${hint}`);
  });
}
