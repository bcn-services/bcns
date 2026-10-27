import {
  clientBilling,
  invoicingEnabled,
  isUnavailable,
  mercuryInvoices,
  mercurySummary,
} from "@/lib/money";
import { createSupabaseServer } from "@/lib/supabase";
import { updateClient } from "./actions";
import { ClientsView, type ClientRow } from "./View";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const sb = createSupabaseServer();
  if (!sb) return <p className="lpad muted">Not configured.</p>;
  const [cl, lk, mercury, invoices] = await Promise.all([
    sb
      .from("clients")
      .select(
        "slug, display_name, kind, stage, health, owner, channel, billing_note, repo_url, monthly_rate_cents, churn_date"
      )
      .is("churn_date", null)
      .order("display_name"),
    sb.from("links").select("client_slug, label, url").not("client_slug", "is", null),
    mercurySummary(),
    mercuryInvoices(),
  ]);
  if (cl.error) return <p className="lpad muted">Clients unavailable.</p>;
  const links = new Map<string, { label: string | null; url: string }[]>();
  for (const l of lk.data ?? [])
    links.set(l.client_slug, [...(links.get(l.client_slug) ?? []), { label: l.label, url: l.url }]);
  const txns = isUnavailable(mercury) ? mercury : mercury.txns;
  const clients: ClientRow[] = (cl.data ?? []).map((c) => ({
    ...c,
    links: links.get(c.slug) ?? [],
    billing: clientBilling(c, txns, invoices),
  }));
  return (
    <ClientsView
      clients={clients}
      mercuryUnavailable={isUnavailable(mercury)}
      invoicing={invoicingEnabled()}
      action={updateClient}
    />
  );
}
