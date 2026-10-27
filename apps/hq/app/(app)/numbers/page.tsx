import { getConfig } from "@/lib/env";
import { getFires } from "@/lib/fires";
import { mercurySummary, stripeSummary } from "@/lib/money";
import { hqRuns, opsSnapshot, type RunEvent } from "@/lib/ops";
import { createSupabaseServer } from "@/lib/supabase";
import { createTaskFromFire, freezeMonthAction } from "./actions";
import { loadFinance } from "./data";
import { Fires } from "./Fires";
import { NumbersView } from "./View";

export const dynamic = "force-dynamic";

export default async function NumbersPage() {
  const sb = createSupabaseServer();
  const cfg = getConfig();
  const [finance, ops, stripe, mercury, fires, runs] = await Promise.all([
    sb ? loadFinance(sb).catch(() => null) : null,
    opsSnapshot(),
    stripeSummary(),
    mercurySummary(),
    getFires(),
    sb
      ? hqRuns(sb, new Date(Date.now() - 24 * 3600_000).toISOString()).catch(() => [] as RunEvent[])
      : [],
  ]);
  return (
    <NumbersView
      finance={finance}
      ops={ops}
      runs={runs}
      stripe={stripe}
      mercury={mercury}
      firesSlot={<Fires fires={fires} create={createTaskFromFire} />}
      freeze={freezeMonthAction}
      instinctUrl={cfg.instinctUrl}
      sentryUrl={cfg.sentryUrl}
    />
  );
}
