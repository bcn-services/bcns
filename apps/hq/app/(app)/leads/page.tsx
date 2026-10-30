import "../../leads.css";
import "../../work.css"; // the New lead modal reuses the Work modal styles
import { leadSlug, loadPitchRows, type Deliverable } from "@/lib/deliverables";
import { createSupabaseServer } from "@/lib/supabase";
import { listTracks } from "@/lib/tracks";
import { ALL_STAGES, LIST_COLS, leadItem, loadLastCalls, loadTrades, stageLabel, stageOptions, type Lead } from "@/lib/leads";
import { LeadsView, type Col } from "./View";

const PAGE = 150;
// key, header, DB column. ponytail: "last call" sorts by updated_at (bumped by every call, but also by other edits); a real last_call_at needs a column or view.
const COLS = [
  ["name", "Business", "name"],
  ["trade", "Trade", "trade"],
  ["town", "Town", "town"],
  ["stage", "Stage", "stage"],
  ["fit", "Fit", "fit_score"],
  ["assigned", "Owner", "assigned_to"],
  ["last", "Last call", "updated_at"],
  ["next", "Next", "next_contact_at"],
  ["consult", "Consult", "consult_at"],
] as const;
const HIDDEN_BY_DEFAULT = ["lost", "sourced", "qualified", "no_email"];

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function LeadsPage({ searchParams }: { searchParams: Params }) {
  const sb = createSupabaseServer();
  if (!sb) return <p className="lpad muted">Supabase is not configured.</p>;

  const sortKey = COLS.find((c) => c[0] === one(searchParams.sort)) ?? COLS[4];
  const firstDir = (k: string) => (k === "fit" ? "desc" : "asc");
  const asked = one(searchParams.dir);
  const dir = asked === "asc" || asked === "desc" ? asked : firstDir(sortKey[0]);
  const f = {
    q: one(searchParams.q).slice(0, 60),
    stage: one(searchParams.stage),
    assigned: one(searchParams.assigned),
    trade: one(searchParams.trade).slice(0, 60),
  };

  let q = sb.from("businesses").select(LIST_COLS, { count: "estimated" }).is("suppressed_at", null);
  // "" hides lost and unworked leads; "any" shows everything
  if (f.stage === "any") {
    // everything
  } else if (ALL_STAGES.includes(f.stage)) q = q.eq("stage", f.stage);
  else q = q.not("stage", "in", `(${HIDDEN_BY_DEFAULT.join(",")})`);
  // the search text goes into a PostgREST filter string: drop its separators and wildcards
  const needle = f.q.replace(/[,()%*\\]/g, " ").trim();
  if (needle) q = q.or(`name.ilike.%${needle}%,town.ilike.%${needle}%`);
  if (f.trade) q = q.eq("trade", f.trade);
  if (f.assigned === "nate" || f.assigned === "brandon") q = q.eq("assigned_to", f.assigned);
  const [res, tradeRes, tracks] = await Promise.all([
    // name then id break ties, so equal values keep one order between reloads
    q.order(sortKey[2], { ascending: dir === "asc", nullsFirst: false }).order("name").order("id").limit(PAGE),
    loadTrades(sb),
    listTracks(sb).catch(() => []), // only the task modal's track list: a failure leaves it empty, not the page broken
  ]);
  if (res.error) return <p className="lpad muted">Could not load leads: {res.error.message}</p>;

  // untyped client: LIST_COLS is the shape (no research; the drawer fetches that on select)
  const leads = (res.data ?? []) as Lead[];
  const trades = tradeRes.trades;
  if (f.trade && !trades.includes(f.trade)) trades.unshift(f.trade);
  const extras = await loadLastCalls(sb, leads.map((l) => l.id));

  // Pitch rows by lead; a lead with no folder yet has none. Without the table (0032 not applied) the tab just
  // starts empty; any other failure is shown in the tab (steps off) instead of passing as an empty history.
  const { rows: bySlug, error: pitchError } = await loadPitchRows(sb, leads.flatMap((l) => leadSlug(l) ?? []));

  const keep = Object.entries(f).filter(([, v]) => v);
  const href = (sort: string, d: string) => `/leads?${new URLSearchParams([...keep, ["sort", sort], ["dir", d]])}`;
  const cols: Col[] = COLS.map(([key, label]) => ({
    key,
    label,
    href: href(key, key === sortKey[0] ? (dir === "asc" ? "desc" : "asc") : firstDir(key)),
    mark: key === sortKey[0] ? (dir === "asc" ? "▲" : "▼") : undefined,
  }));
  const rows: Record<string, Deliverable[]> = {};
  for (const l of leads) {
    const s = leadSlug(l);
    if (s) rows[l.id] = bySlug.get(s) ?? [];
  }
  const now = new Date();
  // the count is the planner's estimate: a short page is the whole list, a full one says "about"
  const total = leads.length < PAGE ? String(leads.length) : `${leads.length} of about ${Math.max(res.count ?? 0, leads.length)}`;

  return (
    <LeadsView
      items={leads.map((l) => leadItem(l, extras.get(l.id), now))}
      cols={cols}
      filters={f}
      stages={[
        { value: "", label: "Any stage" },
        ...ALL_STAGES.map((s) => ({ value: s, label: stageLabel(s) })),
        { value: "any", label: "Everything, lost too" },
      ]}
      trades={trades}
      tracks={tracks}
      newStages={stageOptions().map((s) => ({ value: s, label: stageLabel(s) }))}
      sub={`${total} · sorted by ${sortKey[1].toLowerCase()}`}
      sort={sortKey[0]}
      dir={dir}
      rows={rows}
      pitchError={pitchError}
      tradesError={tradeRes.error}
    />
  );
}
