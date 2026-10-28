import "../../clients.css";
import { buildCards, CLIENT_SELECT, loadHealthSources, type ClientBase } from "@/lib/clients/load";
import { isAdmin } from "@/lib/proposals";
import { createSupabaseServer } from "@/lib/supabase";
import { addClientTask, updateClient } from "./actions";
import { ClientsView } from "./View";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const sb = createSupabaseServer();
  if (!sb) return <p className="lpad muted">Not configured.</p>;
  const [cl, lk, tk, sources, admin] = await Promise.all([
    sb.from("clients").select(CLIENT_SELECT).is("churn_date", null).order("display_name"),
    sb.from("links").select("client_slug, label, url").not("client_slug", "is", null),
    sb
      .from("tasks")
      .select("client_slug, title, status, due")
      .not("client_slug", "is", null)
      .limit(1000),
    loadHealthSources(sb),
    isAdmin(sb),
  ]);
  if (cl.error) return <p className="lpad muted">Clients unavailable.</p>;
  // The client is untyped; the columns are exactly CLIENT_SELECT / the selects above.
  const cards = buildCards(
    (cl.data ?? []) as unknown as ClientBase[],
    sources,
    (lk.data ?? []) as { client_slug: string; label: string | null; url: string }[],
    (tk.data ?? []) as { client_slug: string; title: string; status: string; due: string | null }[]
  );
  return (
    <ClientsView
      cards={cards}
      admin={admin}
      month={new Date().toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
      editAction={updateClient}
      taskAction={addClientTask}
    />
  );
}
