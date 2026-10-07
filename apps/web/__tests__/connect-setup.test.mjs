// /services/connect/setup: the public Claude/ChatGPT setup page for the directory listings.
// Registry-driven: asserts the copy exists, carries the connector URL, support contact and
// privacy link, stays jargon-free outside the URL, and is wired (sitemap, Connect page, CONTENT.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { siteContent } from "../lib/content.ts";
import { siteConfig } from "../lib/site.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const c = siteContent.connectSetup;
const URL_LITERAL = "https://mcp.bcn-services.com/mcp";

function strings(v, path, out = []) {
  if (typeof v === "string") out.push({ path, value: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}
const fields = [...strings(c, "connectSetup"), ...strings(siteContent.pageMeta.connectSetup, "pageMeta.connectSetup")];

test("every connectSetup field is a non-empty string, with five steps per assistant", () => {
  assert.ok(fields.length >= 30);
  for (const { path, value } of fields) assert.ok(value.trim().length > 0, `${path} is empty`);
  assert.equal(c.whatPoints.length, 3);
  assert.equal(c.claude.steps.length, 5);
  assert.equal(c.chatgpt.steps.length, 5);
});

test("connector URL, support contact and privacy link are present", () => {
  assert.equal(c.connectorUrl, URL_LITERAL);
  assert.ok(c.supportBody.includes(siteConfig.email), "support line carries siteConfig.email");
  assert.equal(c.privacyHref, "/privacy");
  assert.match(c.privacyBody, /privacy policy/);
});

test("no jargon anywhere in the page copy except inside the connector URL", () => {
  const banned = /\b(mcp|oauth|server|servers|api|token|tokens|endpoint|protocol|sdk|json|webhook|schema)\b/i;
  for (const { path, value } of fields) {
    const text = value.split(URL_LITERAL).join("");
    assert.ok(!banned.test(text), `${path} contains jargon: ${text}`);
  }
});

test("copy is honest about ChatGPT plans and keeps the $200, no-setup-fee price", () => {
  assert.match(c.chatgpt.intro + c.chatgpt.note, /if your .*plan supports|depends on your .*plan/i);
  assert.match(c.needBody, /\$200\/month, no setup fee/);
  assert.ok(!/free|unlimited/i.test(fields.map((f) => f.value).join(" ")), "no overclaiming");
});

test("no em-dashes in the new copy", () => {
  for (const { path, value } of fields) assert.ok(!value.includes("—"), `${path} has an em-dash`);
});

test("the page is wired: sitemap, Connect page teaser, page file", () => {
  assert.ok(read("app/sitemap.ts").includes('"/services/connect/setup"'));
  assert.ok(read("app/services/connect/page.tsx").includes("ConnectSetupTeaser"));
  assert.ok(read("components/services/connect-setup.tsx").includes('"/services/connect/setup"'));
  const page = read("app/services/connect/setup/page.tsx");
  assert.ok(page.includes("ConnectSetup") && page.includes("pageMeta.connectSetup"));
});

test("CONTENT.md mirrors every connectSetup field and the count is re-derivable", () => {
  const md = read("CONTENT.md");
  assert.ok(md.includes("## Connect Setup (`siteContent.connectSetup`)"));
  for (const key of Object.keys(c)) assert.ok(md.includes(`connectSetup.${key}`), `CONTENT.md missing connectSetup.${key}`);
  assert.ok(md.includes("`pageMeta.connectSetup.title`") && md.includes("`pageMeta.connectSetup.description`"));
  const table = md.split("## Cross-check")[1].split("Total registry fields:")[0];
  const rows = table.split("\n").filter((l) => l.startsWith("| `")).length;
  assert.equal(Number(md.match(/Total registry fields: (\d+)/)[1]), rows, "stated total matches table rows");
});

test("built /services/connect/setup HTML carries the URL, privacy link and mailto (skips without a build)", (t) => {
  let html;
  try {
    html = readFileSync(resolve(root, ".next/server/app/services/connect/setup.html"), "utf8");
  } catch {
    return t.skip("no production build present");
  }
  assert.ok(html.includes(URL_LITERAL));
  assert.ok(html.includes('href="/privacy"'));
  assert.ok(html.includes(`mailto:${siteConfig.email}`));
});
