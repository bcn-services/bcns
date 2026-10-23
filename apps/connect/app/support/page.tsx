import { loadClient, requireHub } from "@/lib/session";
import { UUID, ticketMailto, type TicketRow } from "@/lib/support";
import { createTicketAction } from "./actions";
import { SupportView } from "./view";

export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: { sent?: string; t?: string; error?: string } }) {
  const { api, membership } = await requireHub();
  const client = await loadClient();
  // RLS scopes this to the caller's workspace; 50 is plenty for a hub that has one support contact.
  const { data, error } = await api
    .from("tickets_v1")
    .select("id,subject,body,severity,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const tickets = error ? [] : ((data as TicketRow[] | null) ?? []);

  // The mailto: is rebuilt from the saved row, so the URL carries only its id.
  const saved = searchParams.t && UUID.test(searchParams.t) ? tickets.find((t) => t.id === searchParams.t) : undefined;
  const mailto =
    saved && client?.slug
      ? ticketMailto({
          id: saved.id,
          subject: saved.subject,
          body: saved.body,
          severity: saved.severity,
          clientSlug: client.slug,
          clientName: client.name ?? null,
          requesterEmail: membership.email,
        })
      : null;

  return (
    <SupportView
      tickets={tickets}
      historyFailed={Boolean(error)}
      sent={searchParams.sent}
      error={searchParams.error}
      mailto={mailto}
      timezone={client?.timezone}
      action={createTicketAction}
    />
  );
}
