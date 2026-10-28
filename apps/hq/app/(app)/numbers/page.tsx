import "../../numbers.css";
import { getConfig } from "@/lib/env";
import { getFires } from "@/lib/fires";
import { recentRuns } from "@/lib/fires-ops";
import { invoicingEnabled, mercuryInvoices, mercurySummary, stripeSummary } from "@/lib/money";
import { opsSnapshot } from "@/lib/ops";
import { createSupabaseServer } from "@/lib/supabase";
import { createTaskFromFire } from "./actions";
import { loadClients, loadFinance, parseTab } from "./data";
import { Fires } from "./Fires";
import { NumbersView } from "./View";

export const dynamic = "force-dynamic";

/** Loads only the active tab's data; every source is fail-soft, so a missing env renders "unavailable". */
export default async function NumbersPage({
  searchParams,
}: {
  searchParams?: { tab?: string | string[] };
}) {
  const tab = parseTab(searchParams?.tab);
  const sb = createSupabaseServer();
  const cfg = getConfig();
  const clients = () => (sb ? loadClients(sb).catch(() => null) : null);
  const finance = () => (sb ? loadFinance(sb).catch(() => null) : null);

  if (tab === "money") {
    const invoicing = invoicingEnabled();
    const [c, stripe, mercury, invoices] = await Promise.all([
      clients(),
      stripeSummary(),
      mercurySummary(),
      invoicing ? mercuryInvoices() : { unavailable: true as const },
    ]);
    return <NumbersView tab={tab} clients={c} money={{ stripe, mercury, invoices, invoicing }} />;
  }
  if (tab === "sales") return <NumbersView tab={tab} finance={await finance()} />;
  if (tab === "unit") {
    const [f, c] = await Promise.all([finance(), clients()]);
    return <NumbersView tab={tab} finance={f} clients={c} />;
  }
  const [ops, runs, fires] = await Promise.all([opsSnapshot(), recentRuns(), getFires()]);
  return (
    <NumbersView
      tab={tab}
      ops={{
        ops,
        runs,
        firesSlot: <Fires fires={fires} create={createTaskFromFire} />,
        instinctUrl: cfg.instinctUrl,
        sentryUrl: cfg.sentryUrl,
      }}
    />
  );
}
