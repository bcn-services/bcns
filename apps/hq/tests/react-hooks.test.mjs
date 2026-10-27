/**
 * react-hooks.test.mjs — every name the app imports from "react" / "react-dom"
 * must exist in the React Next actually runs (next/dist/compiled), not just in
 * @types/react. Its canary types declare React 19 hooks (useActionState) that
 * Next 14's React 18 lacks: typecheck passes, then the page 500s.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const req = createRequire(root + "package.json");
const runtime = { react: req("next/dist/compiled/react"), "react-dom": req("next/dist/compiled/react-dom") };

test("named imports from react and react-dom exist in Next's compiled React", () => {
  const missing = [];
  for (const dir of ["app", "lib", "components"]) {
    for (const f of readdirSync(`${root}${dir}`, { recursive: true }).filter((n) => /\.tsx?$/.test(n))) {
      const src = readFileSync(`${root}${dir}/${f}`, "utf8");
      // ponytail: named imports only; add `import * as` handling if one appears.
      for (const m of src.matchAll(/import\s+\{([^}]*)\}\s*from\s*"(react|react-dom)"/g)) {
        for (const name of m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter((n) => n && !n.startsWith("type "))) {
          if (runtime[m[2]][name] === undefined) missing.push(`${dir}/${f}: ${name} from "${m[2]}"`);
        }
      }
    }
  }
  assert.deepEqual(missing, []);
});
