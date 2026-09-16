"use server";

import { redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { loadClient, requireHub } from "@/lib/session";
import { requestConnection } from "@/lib/request-connection";
import { HUB_SOURCES, type HubSource } from "@/lib/sources";

function asSource(value: unknown): HubSource | null {
  return HUB_SOURCES.find((s) => s === value) ?? null;
}

/**
 * Any member may ask bcns to connect a source — it is a request, not a change,
 * so there is no owner gate here. The membership check still runs: the email
 * names a client, and only a member of that client may put it there.
 */
export async function requestConnectionAction(form: FormData): Promise<void> {
  const session = await requireHub();
  const source = asSource(form.get("source"));
  if (!source) redirect("/?error=unknown-source");

  const client = await loadClient();
  const outcome = await requestConnection(
    {
      clientName: client?.name ?? "unknown",
      clientSlug: client?.slug ?? "unknown",
      source,
      requesterEmail: session.membership.email,
    },
    { apiKey: getConfig().resendApiKey }
  );

  redirect(outcome.sent ? `/?requested=${source}` : `/?email=${source}`);
}
