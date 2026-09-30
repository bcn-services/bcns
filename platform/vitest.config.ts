import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { defineConfig } from 'vitest/config';

// A test that imports ./helpers needs the local Supabase stack (`supabase start`).
// Without it those files skip with a message, so a green local run means the
// non-DB tests passed. CI starts the stack first, and never skips: a stack that
// failed to start must fail there, not go green.
async function dbUnreachable(): Promise<string | null> {
  if (process.env.CI) return null;
  const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message || err.name : String(err);
  } finally {
    await client.end().catch(() => {});
  }
}

export default defineConfig(async () => {
  const exclude = ['**/node_modules/**'];
  const why = await dbUnreachable();
  if (why !== null) {
    const skipped = readdirSync('test').filter(
      (f) => f.endsWith('.test.ts') && /from ['"]\.\/helpers/.test(readFileSync(`test/${f}`, 'utf8'))
    );
    exclude.push(...skipped.map((f) => `test/${f}`));
    console.warn(
      `[platform tests] local database unreachable (${why}); SKIPPING ${skipped.length} DB test files. Run \`supabase start\` (or set DATABASE_URL) to run them.`
    );
  }
  return {
    test: {
      include: ['test/**/*.test.ts'],
      exclude,
      fileParallelism: false,
      testTimeout: 60_000,
      hookTimeout: 120_000,
    },
  };
});
