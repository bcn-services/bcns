// apps/web isolation (docs/architecture/platform-v1.md, chunk 1 gate f): the marketing
// site must not import the platform, the client apps or the tenant package, and must not
// fetch the bcns subdomains at build time. Vercel builds apps/web alone; anything crossing
// this line would drag the platform into the Vercel build or break the ignored-build filter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", "out", "__tests__"]);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const files = walk(root);
const FORBIDDEN_IMPORT = [
  /from\s+["'](\.\.\/)+(apps|platform|packages\/(data-client|tenant))\b/,
  /from\s+["']@bcn-services\/(platform|data-client|tenant|sb|connect|mcp)["']/,
  /require\(["'](\.\.\/)+(apps|platform)\b/,
];
const FORBIDDEN_FETCH = /fetch\(\s*["'`]https?:\/\/(connect|mcp|sb)\.bcn-services\.com/;

test("apps/web has source files to check", () => {
  assert.ok(files.length > 10, `only ${files.length} files walked`);
});

test("apps/web imports nothing from apps/*, platform/, packages/data-client or packages/tenant", () => {
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const re of FORBIDDEN_IMPORT) if (re.test(src)) hits.push(`${relative(root, f)}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test("apps/web does not fetch the connect/mcp/sb subdomains", () => {
  const hits = files.filter((f) => FORBIDDEN_FETCH.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
  assert.deepEqual(hits, []);
});

test("apps/web package.json depends on no platform workspace package", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const bad = deps.filter((d) => /^@bcn-services\/(platform|data-client|tenant|sb|connect|mcp)$/.test(d));
  assert.deepEqual(bad, []);
});
