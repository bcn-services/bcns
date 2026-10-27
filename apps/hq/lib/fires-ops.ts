import type { Fire } from "./fires";
import { createSupabaseServer } from "./supabase";
import { hqRuns, opsFiresFrom, opsSnapshot, type RunEvent } from "./ops";

// Connector errors, job errors (24h), urgent tickets, and one "ops unavailable" when the platform
// connection fails. Rules live in ops.ts (`opsFiresFrom`); this only fetches.
export async function opsFires(): Promise<Fire[]> {
  const now = new Date();
  const hq = createSupabaseServer();
  const [snap, runs] = await Promise.all([
    opsSnapshot(),
    (hq
      ? hqRuns(hq, new Date(now.getTime() - 24 * 3600_000).toISOString())
      : Promise.resolve([] as RunEvent[])
    ).catch((e) => {
      console.error(
        `[fires-ops] HQ run events failed: ${e instanceof Error ? e.message : "error"}`
      );
      return [] as RunEvent[]; // an HQ read error is not "ops unavailable"; the platform side still reports
    }),
  ]);
  return opsFiresFrom(snap, runs, now);
}
