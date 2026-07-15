/**
 * Import boundary test — verifies src/renderer/ never imports from electron or node:*.
 *
 * This is a pure static analysis test: reads source files, greps for forbidden
 * import patterns. No network, no Electron, no build step needed.
 *
 * Exit code 0 = all clear. Exit code 1 = violations found.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const RENDERER_DIR = join(__dirname, "../src/renderer");

/** Patterns that must never appear in renderer source */
const FORBIDDEN_PATTERNS = [
  /from\s+["']electron["']/,
  /require\s*\(\s*["']electron["']\s*\)/,
  /from\s+["']node:/,
  /require\s*\(\s*["']node:/,
];

/** Recursively collect all .ts/.tsx files under a directory */
function collectSourceFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if ([".ts", ".tsx"].includes(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = collectSourceFiles(RENDERER_DIR);
const violations = [];

for (const file of files) {
  const contents = readFileSync(file, "utf8");
  const lines = contents.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({ file, line: i + 1, text: line.trim() });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    `[import-boundary] PASS — ${files.length} renderer file(s) checked, 0 violations`
  );
  process.exit(0);
} else {
  console.error(`[import-boundary] FAIL — ${violations.length} violation(s) found:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  process.exit(1);
}
