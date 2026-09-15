/**
 * scripts/briefing.ts — `pnpm briefing`: the morning run the droplet cron
 * calls (DEPLOY.md). Signs in as the agent user, works out "yesterday" in the
 * client's timezone (client_v1), and prints the Daily Financial Report.
 */

import { signIn } from "@bcn-services/data-client";
import { getConfig } from "../lib/env";
import { loadShellData } from "../lib/header";
import { formatDailyReportText, loadDailyReport, yesterdayInTimezone } from "../lib/daily-report";

async function main(): Promise<void> {
  const config = getConfig();
  if (config.dataSource !== "shared") {
    console.error("briefing: DATA_SOURCE must be 'shared'");
    process.exit(1);
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.agentEmail || !config.agentPassword) {
    console.error("briefing: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, AGENT_EMAIL and AGENT_PASSWORD are required");
    process.exit(1);
  }

  const data = await signIn({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    email: config.agentEmail,
    password: config.agentPassword,
  });

  const { timezone } = await loadShellData(data);
  const { report, errors } = await loadDailyReport(data, yesterdayInTimezone(timezone));
  if (errors.length) console.error(`briefing: read failed for ${errors.join(", ")}`);
  console.log(formatDailyReportText(report));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
