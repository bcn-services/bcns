import * as React from "react";
import type { Fire } from "./fires";
import { createSupabaseServer } from "./supabase";
import { hqRuns, opsFiresFrom, opsSnapshot, type RunEvent } from "./ops";

// React.cache dedupes per request in a server component (the page and opsFires() share one read);
// plain Node (the tests) has none, so there it is a plain call. The platform snapshot dedupes in ops.ts.
const cache: <R>(f: () => R) => () => R = React.cache ?? ((f) => f);

/** HQ job runs from the last 24h. A read error is logged and reads as none. */
export const recentRuns = cache(async (): Promise<RunEvent[]> => {
  const hq = createSupabaseServer();
  if (!hq) return [];
  try {
    return await hqRuns(hq, new Date(Date.now() - 24 * 3600_000).toISOString());
  } catch (e) {
    console.error(`[fires-ops] HQ run events failed: ${e instanceof Error ? e.message : "error"}`);
    return []; // an HQ read error is not "ops unavailable"; the platform side still reports
  }
});

// Connector errors, job errors (24h), urgent tickets, and one "ops unavailable" when the platform
// connection fails. Rules live in ops.ts (`opsFiresFrom`); this only fetches.
export async function opsFires(): Promise<Fire[]> {
  const [snap, runs] = await Promise.all([opsSnapshot(), recentRuns()]);
  return opsFiresFrom(snap, runs, new Date());
}
