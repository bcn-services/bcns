/**
 * media-links.test.mjs — one-tap Drive downloads (web_content_link) and the
 * library's Drive Folders sidebar (attributes.folder_path).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileLink, fileLinkProps, filterFolder, folderPath, folderTree } from "../lib/library.ts";

// tsx compiles this app's JSX with the classic runtime, so the component needs React in scope.
globalThis.React = React;
const { FileLink } = await import("../app/_components/FileLink.tsx");
const { createElement } = React;
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const drive = (attributes, extra = {}) => ({ id: "m", source: "drive", attributes, ...extra });
const VIEW = "https://drive.google.com/file/d/1/view";
const DIRECT = "https://drive.google.com/uc?id=1&export=download";

test("fileLink: web_content_link is a direct download, absent it falls back to Open in Drive", () => {
  assert.deepEqual(fileLink(drive({ web_view_link: VIEW, web_content_link: DIRECT })), { kind: "download", href: DIRECT });
  assert.deepEqual(fileLink(drive({ web_view_link: VIEW, web_content_link: null })), { kind: "open", href: VIEW });
  assert.deepEqual(fileLink(drive({ web_view_link: VIEW })), { kind: "open", href: VIEW });
});

test("fileLink: only https Drive rows; uploads and junk get none (uploads keep the metered path)", () => {
  assert.equal(fileLink({ source: "upload", attributes: { web_content_link: DIRECT } }), null);
  assert.equal(fileLink(drive({ web_content_link: "javascript:alert(1)", web_view_link: "http://x.example" })), null);
  assert.equal(fileLink(drive(null)), null);
});

test("FileLink renders <a href download> for a direct link and a plain Open in Drive link without one", () => {
  const dl = renderToStaticMarkup(createElement(FileLink, { row: drive({ web_content_link: DIRECT, web_view_link: VIEW }) }));
  assert.match(dl, /<a [^>]*href="https:\/\/drive\.google\.com\/uc\?id=1&amp;export=download"/);
  assert.match(dl, /\sdownload=""/);
  assert.match(dl, /rel="noopener noreferrer"/);
  assert.match(dl, />Download</);
  const open = renderToStaticMarkup(createElement(FileLink, { row: drive({ web_view_link: VIEW }) }));
  assert.match(open, new RegExp(`href="${VIEW}"`));
  assert.doesNotMatch(open, /download/);
  assert.match(open, />Open in Drive</);
  assert.equal(renderToStaticMarkup(createElement(FileLink, { row: { source: "upload" } })), "");
  assert.equal(fileLinkProps({ kind: "open", href: VIEW }).download, undefined);
});

test("every one-tap surface goes through fileLink: item view and tray (DownloadControl), library tiles, home tiles", () => {
  const lib = read("../app/library/page.tsx");
  assert.match(lib, /function DownloadControl[\s\S]*?if \(fileLink\(row\)\) return <FileLink row=\{row\} label=\{label\} \/>;/);
  assert.match(lib, /<FileLink row=\{row\} className="[^"]*btn-plain--tile" \/>/);
  const home = read("../app/page.tsx");
  assert.match(home, /link: fileLink\(m\)/);
  assert.match(home, /<a className="thumb-tile thumb-tile--link"[^>]*\{\.\.\.fileLinkProps\(tile\.link\)\}/);
});

const f = (folder_path) => ({ source: "drive", attributes: { folder_path } });

test("folderPath: '' and missing both mean the root", () => {
  assert.equal(folderPath(f("")), "");
  assert.equal(folderPath({ source: "drive" }), "");
  assert.equal(folderPath(f("A/B")), "A/B");
});

test("folderTree: distinct folders plus ancestors, parents first, counts include descendants, root makes no node", () => {
  const tree = folderTree([f(""), f("Ads"), f("Ads/2026"), f("Ads/2026"), f("Ads 2"), f("Zed/Deep/Deeper")]);
  assert.deepEqual(
    tree.map((n) => [n.path, n.name, n.depth, n.count]),
    [
      ["Ads", "Ads", 0, 3],
      ["Ads/2026", "2026", 1, 2],
      ["Ads 2", "Ads 2", 0, 1],
      ["Zed", "Zed", 0, 1],
      ["Zed/Deep", "Deep", 1, 1],
      ["Zed/Deep/Deeper", "Deeper", 2, 1],
    ],
  );
  assert.deepEqual(folderTree([f("")]), []);
});

test("filterFolder: a folder keeps its own files and its subfolders', not a sibling with the same prefix", () => {
  const rows = [f("Ads"), f("Ads/2026"), f("Ads 2"), f("")];
  assert.equal(filterFolder(rows, "Ads").length, 2);
  assert.equal(filterFolder(rows, "Ads/2026").length, 1);
  assert.equal(filterFolder(rows, "").length, 4);
});

test("library sidebar: Folders above Sets, each with a help popup, Creative Folder gone, unknown ?folder ignored", () => {
  const lib = read("../app/library/page.tsx");
  assert.ok(lib.indexOf('title="Folders"') > 0 && lib.indexOf('title="Folders"') < lib.indexOf('title="Sets"'));
  assert.equal((lib.match(/<HelpPopup label=/g) ?? []).length, 2);
  assert.doesNotMatch(lib, /title="Creative Folder"/);
  assert.match(lib, /folders\.find\(\(f\) => f\.path === firstParam\(searchParams\.folder/);
  // Sets still work as before: the existing set controls are untouched.
  assert.match(lib, /op" value="rename"/);
});
