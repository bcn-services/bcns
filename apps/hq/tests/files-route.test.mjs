/** files-route.test.mjs — the /files path guard (serveClientFile) against a real tmp os clone. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { serveClientFile } = await import("../lib/files.ts");
const { isPublic } = await import("../lib/gate.ts");

const os = mkdtempSync(join(tmpdir(), "hq-files-"));
const outside = mkdtempSync(join(tmpdir(), "hq-outside-"));
mkdirSync(join(os, "clients/acme/demo"), { recursive: true });
mkdirSync(join(os, "knowledge"));
writeFileSync(join(os, "clients/acme/demo/demo.html"), "<h1>hi</h1>");
writeFileSync(join(os, "clients/acme/notes.md"), "# n");
writeFileSync(join(os, "clients/acme/a.bin"), "x");
writeFileSync(join(os, "clients/acme/.secret"), "s");
writeFileSync(join(os, "knowledge/private.md"), "private");
writeFileSync(join(outside, "loot.txt"), "loot");
symlinkSync(outside, join(os, "clients/acme/escape"));
symlinkSync(join(outside, "loot.txt"), join(os, "clients/acme/loot.html"));
symlinkSync(join(os, "knowledge/private.md"), join(os, "clients/acme/sib.md"));
// A symlink that stays inside clients/ is fine.
symlinkSync(join(os, "clients/acme/notes.md"), join(os, "clients/acme/alias.md"));

const get = (segs, dir = os) => serveClientFile(segs, dir);

test("serves a file under clients/ with type, nosniff, sandbox CSP and no-store", async () => {
  const r = await get(["clients", "acme", "demo", "demo.html"]);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "<h1>hi</h1>");
  assert.equal(r.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("content-security-policy"), "sandbox allow-scripts allow-modals allow-popups");
  assert.ok(!/allow-same-origin/.test(r.headers.get("content-security-policy")));
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});

test("content types: md is text/plain, unknown is octet-stream", async () => {
  assert.equal((await get(["clients", "acme", "notes.md"])).headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal((await get(["clients", "acme", "a.bin"])).headers.get("content-type"), "application/octet-stream");
});

test("refuses .. segments, plain and encoded", async () => {
  for (const segs of [
    ["clients", "acme", "..", "..", "knowledge", "private.md"],
    ["clients", "..", "knowledge", "private.md"],
    ["clients", "acme", "%2e%2e", "%2e%2e", "knowledge", "private.md"],
    ["clients", "acme", "%2E%2E%2Fknowledge"],
    ["clients", "acme", "..%2fknowledge%2fprivate.md"],
    ["clients", "acme", "x%5c..%5cy"],
    ["clients", "acme", "demo.html%00.png"],
  ]) {
    const r = await get(segs);
    assert.equal(r.status, 400, JSON.stringify(segs));
    assert.ok(!(await r.text()).includes("private"));
  }
});

test("refuses absolute paths, NUL, backslashes, empty segments and dotfiles", async () => {
  for (const segs of [
    ["/etc/passwd"],
    ["clients", "/etc/passwd"],
    ["clients", "acme", "a\0b"],
    ["clients", "acme", "a\\b"],
    ["clients", "", "demo.html"],
    ["clients", "acme", ".secret"],
    ["clients", ".git", "config"],
    ["clients", "acme", "."],
  ])
    assert.equal((await get(segs)).status, 400, JSON.stringify(segs));
});

test("refuses anything outside clients/", async () => {
  for (const segs of [["knowledge", "private.md"], ["private.md"], [], ["clients"], ["clientsx", "acme"], undefined])
    assert.equal((await get(segs)).status, 400, JSON.stringify(segs));
});

test("refuses a symlink that escapes clients/ (dir or file, outside the clone or elsewhere in it)", async () => {
  for (const segs of [
    ["clients", "acme", "escape", "loot.txt"],
    ["clients", "acme", "loot.html"],
    ["clients", "acme", "sib.md"],
  ]) {
    const r = await get(segs);
    assert.equal(r.status, 404, JSON.stringify(segs));
    const t = await r.text();
    assert.ok(!t.includes("loot") || t === "not found");
  }
  assert.equal((await get(["clients", "acme", "alias.md"])).status, 200);
});

test("a directory, a missing file and a missing clients/ are 404", async () => {
  assert.equal((await get(["clients", "acme"])).status, 404);
  assert.equal((await get(["clients", "acme", "nope.html"])).status, 404);
  const empty = mkdtempSync(join(tmpdir(), "hq-empty-"));
  assert.equal((await get(["clients", "acme", "demo", "demo.html"], empty)).status, 404);
});

test("unset or blank HQ_OS_DIR is 503, never a crash", async () => {
  const keep = process.env.HQ_OS_DIR;
  delete process.env.HQ_OS_DIR;
  try {
    assert.equal((await serveClientFile(["clients", "a", "b"])).status, 503);
    assert.equal((await serveClientFile(["clients", "a", "b"], "  ")).status, 503);
  } finally {
    if (keep !== undefined) process.env.HQ_OS_DIR = keep;
  }
});

test("/files is not a public path: the middleware gate applies", () => {
  assert.equal(isPublic("/files/clients/acme/demo/demo.html"), false);
});
