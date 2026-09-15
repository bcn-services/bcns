"use server";

/**
 * The home page's "Generate briefing" button (DESIGN.md "Daily Briefing").
 * Runs as the signed-in user; lib/briefing.ts applies the AI gates, the
 * monthly cap and the 15-minute limit. The result comes back as a
 * `?briefing=<code>` that the page maps to fixed copy.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDataClient } from "@/lib/data";
import { getConfig } from "@/lib/env";
import { loadShellData } from "@/lib/header";
import { runBriefing } from "@/lib/briefing";
import { isValidYmd } from "@/lib/overview";

export async function generateBriefingNow(form: FormData): Promise<void> {
  const params = new URLSearchParams();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (isValidYmd(from) && isValidYmd(to)) {
    params.set("from", from);
    params.set("to", to);
  }

  let code = "failed";
  const client = await getDataClient();
  if (client) {
    try {
      const { timezone } = await loadShellData(client);
      const outcome = await runBriefing({ client, config: getConfig(), timezone, onDemand: true });
      if (outcome.status === "failed") console.error(`briefing: ${outcome.message}`);
      code = outcome.status === "skipped" ? outcome.reason : outcome.status;
    } catch (err) {
      console.error("briefing: on-demand run failed", err instanceof Error ? err.message : err);
    }
  }
  params.set("briefing", code);
  revalidatePath("/");
  redirect(`/?${params.toString()}`);
}
