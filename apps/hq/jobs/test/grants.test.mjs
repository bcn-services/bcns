// Every HQ table a job touches must have a `grant ... on <table> to hq_jobs` in a hand-run migration
// footer (hq_jobs grants are never applied by a migration; Nate runs them). Job tests run as a
// privileged user, so a table read without a grant only fails in production ("permission denied").
// Static and crude on purpose: table names after from/join/into/update, kept only if a migration
// creates a table of that name.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const mig = join(here, "../../supabase/migrations");
const migrations = readdirSync(mig)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(mig, f), "utf8"))
  .join("\n");

const known = new Set(
  [...migrations.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)].map((m) => m[1])
);
const granted = new Set(
  [...migrations.matchAll(/grant\s+[\w\s,]+?\s+on\s+([\w\s,]+?)\s+to\s+hq_jobs/gi)].flatMap((m) =>
    m[1].split(",").map((t) => t.trim())
  )
);

const files = [here + "..", here + "../lib"].flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => join(d, f))
);

test("every table a job touches has an hq_jobs grant in a migration footer", () => {
  const missing = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\b(?:from|join|into|update)\s+(?:public\.)?(\w+)/gi)) {
      const t = m[1].toLowerCase();
      if (known.has(t) && !granted.has(t)) missing.push(`${f.split("/jobs/")[1]}: ${t}`);
    }
  }
  assert.deepEqual([...new Set(missing)], [], "add `grant ... to hq_jobs` to a migration footer");
});
