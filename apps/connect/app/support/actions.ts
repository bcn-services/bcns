"use server";

import { redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { loadClient, requireHub } from "@/lib/session";
import { createTicket } from "@/lib/support";

/** Any member of the workspace may write to bcns. The database takes the workspace from the membership, never from the form. */
export async function createTicketAction(form: FormData): Promise<void> {
  const { api, membership } = await requireHub();
  const client = await loadClient();
  redirect(
    await createTicket(form, {
      api,
      requesterEmail: membership.email,
      clientName: client?.name ?? null,
      apiKey: getConfig().resendApiKey,
    })
  );
}
