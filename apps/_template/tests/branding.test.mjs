/**
 * branding.test.mjs — api.client_v1.branding read generically (lib/branding.ts):
 * logo and name on the page, favicon and title in the document metadata, a text
 * fallback whenever branding is null or the read fails. Same lib as apps/sb/lib/branding.ts; keep them in step.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandingMetadata, brandingPublicUrl, loadBranding, resolveBranding } from "../lib/branding.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const URL_ = "https://proj.supabase.co";
const CID = "11111111-1111-1111-1111-111111111111";

test("brandingPublicUrl: public bucket URL for a bucket-relative path, nothing for traversal or schemes", () => {
  assert.equal(brandingPublicUrl(URL_, `${CID}/logo.png`), `${URL_}/storage/v1/object/public/branding/${CID}/logo.png`);
  assert.equal(brandingPublicUrl(`${URL_}/`, "a/logo.png"), `${URL_}/storage/v1/object/public/branding/a/logo.png`);
  for (const bad of ["../x.png", "a/../x.png", "/etc/passwd", "https://evil.example/x.png", "", "a b.png"]) assert.equal(brandingPublicUrl(URL_, bad), null);
  assert.equal(brandingPublicUrl(undefined, "a/logo.png"), null);
});

test("resolveBranding: null when the client has none; name, logo and favicon when set", () => {
  assert.equal(resolveBranding({ client_id: CID, branding: null }, URL_), null);
  assert.equal(resolveBranding({ client_id: CID, branding: [] }, URL_), null);
  assert.equal(resolveBranding({ client_id: CID }, URL_), null);
  assert.equal(resolveBranding(null, URL_), null);
  assert.deepEqual(resolveBranding({ client_id: CID, branding: { name: " Acme ", logo_path: `${CID}/logo.png` } }, URL_), {
    name: "Acme",
    logoUrl: `${URL_}/storage/v1/object/public/branding/${CID}/logo.png`,
    faviconUrl: `${URL_}/storage/v1/object/public/branding/${CID}/favicon.png`,
  });
});

test("resolveBranding: a hostile logo_path or non-string fields fall back to text", () => {
  const b = resolveBranding({ client_id: CID, branding: { name: 42, logo_path: "../../x" } }, URL_);
  assert.equal(b.name, null);
  assert.equal(b.logoUrl, null);
});

test("loadBranding: never throws; a failing or empty read is no branding", async () => {
  const single = (result) => ({ views: { client_v1: () => ({ single: async () => result }) } });
  assert.equal(await loadBranding(single({ data: null, error: { message: "column branding does not exist" } }), URL_), null);
  assert.equal(await loadBranding({ views: { client_v1: () => { throw new Error("boom"); } } }, URL_), null);
  const ok = await loadBranding(single({ data: { client_id: CID, branding: { name: "Acme" } }, error: null }), URL_);
  assert.equal(ok.name, "Acme");
});

test("brandingMetadata: title from the name and favicon from the bucket; the fallback untouched when null", () => {
  const fallback = { title: "Default", description: "d" };
  assert.equal(brandingMetadata(null, fallback), fallback);
  const m = brandingMetadata({ name: "Acme", logoUrl: null, faviconUrl: `${URL_}/f.png` }, fallback);
  assert.equal(m.title, "Acme");
  assert.equal(m.description, "d");
  assert.deepEqual(m.icons, { icon: `${URL_}/f.png` });
  assert.equal(brandingMetadata({ name: null, logoUrl: null, faviconUrl: null }, fallback).title, "Default");
});

test("page: logo <img> when logo_path is set, text title otherwise; layout builds metadata from branding", () => {
  const page = read("../app/page.tsx");
  assert.match(page, /branding\?\.logoUrl \? \(/);
  assert.match(page, /<img src=\{branding\.logoUrl\} alt=\{title\}/);
  assert.match(page, /const title = branding\?\.name \?\? "bcns App Template";/);
  const layout = read("../app/layout.tsx");
  assert.match(layout, /export async function generateMetadata/);
  assert.match(layout, /brandingMetadata\(/);
  assert.match(layout, /catch \{\s*return FALLBACK;/);
});
