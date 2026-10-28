/**
 * files.ts — serves deliverables the deliverable job wrote into the os clone, from
 * HQ_OS_DIR/clients/ only. The caller (app/files/[...path]/route.ts, behind the middleware gate) has
 * already checked the session. This is the path guard: no `..`, no absolute or encoded traversal, no NUL,
 * no dotfiles, and the realpath must stay inside HQ_OS_DIR/clients (a symlink cannot walk out).
 *
 * The HTML is written by a model from untrusted lead content and is served on the HQ origin, which
 * holds the session cookie. `Content-Security-Policy: sandbox ...` (no allow-same-origin) makes it an
 * opaque origin: its scripts run, but cannot read cookies or call HQ as the signed-in user.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_BYTES = 25 * 1024 * 1024;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "sandbox allow-scripts allow-modals allow-popups",
  "cache-control": "private, no-store",
};

const plain = (status: number, msg: string): Response =>
  new Response(msg, { status, headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" } });

/** Segments are already URL-decoded by Next; a leftover %2e/%2f/%5c/%00 is double-encoding, refused. */
function badSegment(s: unknown): boolean {
  return (
    typeof s !== "string" ||
    s === "" ||
    s === "." ||
    s === ".." ||
    s.startsWith(".") ||
    /[\\/\0]/.test(s) ||
    /%(2e|2f|5c|00)/i.test(s)
  );
}

export async function serveClientFile(
  segments: string[] | undefined,
  osDir: string | undefined = process.env.HQ_OS_DIR
): Promise<Response> {
  if (!osDir?.trim()) return plain(503, "files unavailable");
  if (!Array.isArray(segments) || segments.length < 2 || segments[0] !== "clients" || segments.some(badSegment))
    return plain(400, "bad path");

  try {
    const root = await fs.realpath(path.join(osDir, "clients"));
    const target = await fs.realpath(path.join(root, ...segments.slice(1)));
    if (!target.startsWith(root + path.sep)) return plain(404, "not found");
    const st = await fs.stat(target);
    if (!st.isFile()) return plain(404, "not found");
    if (st.size > MAX_BYTES) return plain(413, "too large");
    const body = await fs.readFile(target);
    const type = TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
    return new Response(new Uint8Array(body), { status: 200, headers: { ...HEADERS, "content-type": type } });
  } catch {
    return plain(404, "not found"); // missing, unreadable, or a dangling symlink
  }
}
