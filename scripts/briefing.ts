/**
 * scripts/briefing.ts — `pnpm briefing`: the morning run the droplet cron
 * calls (DEPLOY.md). Signs in as AGENT_EMAIL (SB v1: the smoke user), works out "yesterday" in the
 * client's timezone (client_v1), and prints the Daily Financial Report.
 */

import { signIn } from "@bcn-services/data-client";
import { getConfig } from "../lib/env";
import { loadShellData } from "../lib/header";
import { formatDailyReportText, loadDailyReport, yesterdayInTimezone } from "../lib/daily-report";
import { SKIP_NOTES, runBriefing } from "../lib/briefing";

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

  // Cron run: the monthly cap applies, the on-demand 15-minute limit does not.
  const outcome = await runBriefing({ client: data, config, timezone });
  if (outcome.status === "saved") {
    console.log(`\nDaily Briefing — ${outcome.day}\n${outcome.text}`);
  } else if (outcome.status === "skipped") {
    console.log(`\n${SKIP_NOTES[outcome.reason]}`);
  } else {
    console.error(`briefing: ${outcome.message}`);
    console.log("\nThe briefing failed. The Daily Financial Report above is complete.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
