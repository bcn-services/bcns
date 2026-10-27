import { LeadBoard } from "@/components/TodayBrandonBoard";
import { LeadBody } from "@/components/TodayBrandonLead";
import type { Section } from "@/components/Board";
import { createSupabaseServer } from "@/lib/supabase";
import { ALL_STAGES, LEAD_COLS, leadRow, loadExtras, stageLabel, type Lead } from "@/lib/leads";

const PAGE = 150;
// header click -> column. ponytail: "last call" sorts by updated_at (bumped by every call, but also by other edits); a real last_call_at needs a column or view.
const COLS = [
  ["name", "Business", "name"],
  ["trade", "Trade", "trade"],
  ["town", "Town", "town"],
  ["stage", "Stage", "stage"],
  ["fit", "Fit", "fit_score"],
  ["assigned", "Assigned", "assigned_to"],
  ["last", "Last call", "updated_at"],
  ["next", "Next contact", "next_contact_at"],
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
    stage: one(searchParams.stage),
    trade: one(searchParams.trade).slice(0, 60),
    town: one(searchParams.town).slice(0, 60),
    assigned: one(searchParams.assigned),
    minfit: one(searchParams.minfit),
  };
  const minfit = Number(f.minfit);

  let q = sb.from("businesses").select(LEAD_COLS, { count: "exact" }).is("suppressed_at", null);
  if (f.stage === "any") {
    // everything, lost and unworked included
  } else if (ALL_STAGES.includes(f.stage)) q = q.eq("stage", f.stage);
  else q = q.not("stage", "in", `(${HIDDEN_BY_DEFAULT.join(",")})`);
  if (f.trade) q = q.ilike("trade", `%${f.trade}%`);
  if (f.town) q = q.ilike("town", `%${f.town}%`);
  if (f.assigned === "nate" || f.assigned === "brandon") q = q.eq("assigned_to", f.assigned);
  if (f.minfit && Number.isFinite(minfit)) q = q.gte("fit_score", minfit);
  const { data, count, error } = await q
    .order(sortKey[2], { ascending: dir === "asc", nullsFirst: false })
    .order("name")
    .limit(PAGE);
  if (error) return <p className="lpad muted">Could not load leads: {error.message}</p>;

  // untyped client: LEAD_COLS is the shape
  const leads = (data ?? []) as Lead[];
  const extras = await loadExtras(sb, leads.map((l) => l.id));

  const keep = Object.entries(f).filter(([, v]) => v);
  const href = (sort: string, d: string) => `/leads?${new URLSearchParams([...keep, ["sort", sort], ["dir", d]])}`;
  const sections: Section[] = [
    {
      id: "grid",
      title: "Leads",
      sub: count && count > leads.length ? `showing ${leads.length} of ${count}` : undefined,
      columns: COLS.map(([k, label]) => ({
        label,
        href: href(k, k === sortKey[0] ? (dir === "asc" ? "desc" : "asc") : firstDir(k)),
        mark: k === sortKey[0] ? (dir === "asc" ? "▲" : "▼") : undefined,
      })),
      rows: leads.map((l) => leadRow(l, extras.get(l.id), "grid")),
    },
  ];
  const details: Record<string, React.ReactNode> = {};
  for (const l of leads) details[l.id] = <LeadBody lead={l} x={extras.get(l.id)} />;

  return (
    <LeadBoard
      head={
        <>
          <h1>Leads</h1>
          <form className="filters" method="get" action="/leads">
            <input type="hidden" name="sort" value={sortKey[0]} />
            <input type="hidden" name="dir" value={dir} />
            <label>
              Status
              <select name="stage" defaultValue={f.stage}>
                <option value="">Active</option>
                <option value="any">Any</option>
                {ALL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {stageLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trade
              <input name="trade" defaultValue={f.trade} />
            </label>
            <label>
              Town
              <input name="town" defaultValue={f.town} />
            </label>
            <label>
              Assigned
              <select name="assigned" defaultValue={f.assigned}>
                <option value="">Anyone</option>
                <option value="brandon">Brandon</option>
                <option value="nate">Nate</option>
              </select>
            </label>
            <label>
              Min fit
              <input name="minfit" type="number" min={0} max={100} defaultValue={f.minfit} />
            </label>
            <button className="btn" type="submit">
              Filter
            </button>
            <a className="lnkb" href="/leads">
              Reset
            </a>
          </form>
        </>
      }
      sections={sections}
      details={details}
      emptyText="No leads match."
    />
  );
}
