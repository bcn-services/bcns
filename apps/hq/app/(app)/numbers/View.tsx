import type { ReactNode } from "react";
import { Cols, Spark } from "@/components/NumbersCharts";
import { addDays, GOALS, nyWeek, UNIT, unitEconomics, weekTotals } from "@/lib/finance";
import {
  clientBilling,
  isUnavailable,
  mercuryWeeks,
  mrr,
  mrrSeries,
  type ClientBilling,
  type MercuryInvoice,
  type MercurySummary,
  type StripeSummary,
  type Unavailable,
} from "@/lib/money";
import type { OpsSnapshot, RunEvent } from "@/lib/ops";
import { TABS, type Finance, type NumbersClient, type Tab } from "./data";

const WEEKS = 12;
const usd = (c: number | null) =>
  c == null ? "–" : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const int = (v: number) => String(Math.round(v));
const times = (v: number) => `${v.toFixed(1)}×`;
const pct = (v: number) => `${Math.round(v)}%`;
const last = (v: number[]) => v[v.length - 1] ?? 0;
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const why = (u: Unavailable, what: string) => `${what} unavailable${u.error ? `: ${u.error}` : ""}`;

/** A tile: label, this week's value, change vs last week, sparkline, and a goal bar when there is one.
 *  `vals` null = the source is down: the tile says why instead of showing a made-up zero. */
function Tile(p: {
  name: string;
  vals: number[] | null;
  labels: string[];
  fmt: (v: number) => string;
  goal?: number;
  lowGood?: boolean;
  /** Shown instead of the last point when the two differ (an undefined ratio shows "–"). */
  value?: string;
  error?: string;
}) {
  if (!p.vals)
    return (
      <div className="card tile">
        <div className="lbl">{p.name}</div>
        <div className="val">–</div>
        <div className="foot">
          <span className="chip bad">{p.error ?? "unavailable"}</span>
        </div>
      </div>
    );
  const now = last(p.vals);
  const d = now - (p.vals[p.vals.length - 2] ?? 0);
  const good = p.lowGood ? d < 0 : d > 0;
  return (
    <div className="card tile">
      <div className="lbl">{p.name}</div>
      <div className="val">{p.value ?? p.fmt(now)}</div>
      <div className="foot">
        <span className="dl">
          {d ? (
            <>
              <span className={good ? "up" : "down"}>
                {d > 0 ? "▲" : "▼"} {p.fmt(Math.abs(d))}
              </span>{" "}
              <span className="muted">vs last wk</span>
            </>
          ) : (
            <span className="muted">same as last week</span>
          )}
        </span>
        <Spark vals={p.vals} labels={p.labels} fmt={p.fmt} />
      </div>
      {p.goal ? (
        <>
          <div className="bar" title={`goal ${p.fmt(p.goal)}`}>
            <i
              style={{
                width: `${Math.min(100, (now / p.goal) * 100)}%`,
                ...(now >= p.goal ? { background: "var(--ok)" } : {}),
              }}
            />
          </div>
          <div className="note">goal {p.fmt(p.goal)}</div>
        </>
      ) : null}
    </div>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid4">{children}</div>;
const Pair = ({ children }: { children: ReactNode }) => <div className="grid2">{children}</div>;

// --- Money ---------------------------------------------------------------------------------------

export interface MoneyProps {
  stripe: StripeSummary | Unavailable;
  mercury: MercurySummary | Unavailable;
  invoices: MercuryInvoice[] | Unavailable;
  /** MERCURY_INVOICING=1: only then is a missing invoice list an error. */
  invoicing: boolean;
}

function paidChip(c: NumbersClient, b: ClientBilling, month: string): [string, string] {
  if (c.billing_source === "stripe") return ["", "billed via Stripe"];
  if (c.billing_source === "none") return ["", "no recurring billing"];
  if (!b.mercury) return ["", "billing unavailable"];
  if (b.invoice?.overdue) return ["bad", `${b.invoice.overdue} overdue`];
  if (b.lastPaid?.at.slice(0, 7) === month) return ["ok", "paid"];
  if (b.lastPaid) return ["warn", `last paid ${b.lastPaid.at.slice(0, 10)}`];
  return ["warn", "no payment found"];
}

function MoneyTab(p: {
  m: MoneyProps | undefined;
  clients: NumbersClient[] | null | undefined;
  weeks: string[];
  labels: string[];
  today: string;
}) {
  const { m, clients, weeks, labels } = p;
  if (!m) return <div className="empty">Money unavailable.</div>;
  const total = clients ? mrr(m.stripe, clients) : null;
  const series = clients ? mrrSeries(weeks, m.stripe, clients) : null;
  if (series && total) series[series.length - 1] = total.total; // the tile and the chart agree
  const ok = isUnavailable(m.mercury) ? null : m.mercury;
  const mw = ok ? mercuryWeeks(weeks, ok) : null;
  const merr = isUnavailable(m.mercury) ? why(m.mercury, "Mercury") : undefined;
  const txns = ok ? ok.txns : { unavailable: true as const };
  const month = p.today.slice(0, 7);
  const live = (clients ?? []).filter((c) => !c.churn_date);
  return (
    <>
      <Grid>
        <Tile
          name="MRR"
          vals={series}
          labels={labels}
          fmt={usd}
          goal={GOALS.mrrCents}
          error="Clients unavailable"
        />
        <Tile
          name="Cash (Mercury)"
          vals={mw?.cash ?? null}
          labels={labels}
          fmt={usd}
          error={merr}
        />
        <Tile
          name="Money in, week"
          vals={mw?.inflow ?? null}
          labels={labels}
          fmt={usd}
          error={merr}
        />
        <Tile
          name="Money out, week"
          vals={mw?.burn ?? null}
          labels={labels}
          fmt={usd}
          lowGood
          error={merr}
        />
      </Grid>
      <Pair>
        <div className="card tile">
          <h2>MRR, 12 weeks</h2>
          {total ? (
            <p className="muted sub">
              Mercury recurring {usd(total.mercury)} · Stripe {usd(total.stripe)}
            </p>
          ) : null}
          {isUnavailable(m.stripe) ? (
            <p>
              <span className="chip bad">{why(m.stripe, "Stripe")}</span>
            </p>
          ) : null}
          {total?.excluded.length ? (
            <p>
              {total.excluded.map((x) => (
                <span key={x.id} className="chip warn">
                  {x.id} {x.cancelAt ? `cancels ${x.cancelAt}` : "cancels at period end"}
                </span>
              ))}
            </p>
          ) : null}
          {series ? (
            <Cols
              name="MRR, 12 weeks"
              vals={series.map((v) => v / 100)}
              labels={labels}
              fmt={(v) => usd(v * 100)}
              goal={GOALS.mrrCents / 100}
            />
          ) : (
            <div className="empty">Clients unavailable.</div>
          )}
        </div>
        <div className="card tile">
          <h2>By client</h2>
          {m.invoicing && isUnavailable(m.invoices) ? (
            <p>
              <span className="chip bad">
                {m.invoices.error ?? "Mercury invoicing unavailable"}
              </span>
            </p>
          ) : null}
          {merr ? (
            <p>
              <span className="chip bad">{merr}</span>
            </p>
          ) : null}
          {clients ? null : <div className="empty">Clients unavailable.</div>}
          {live.map((c) => {
            const b = clientBilling(c, txns, m.invoicing ? m.invoices : null, p.today);
            const [cls, txt] = paidChip(c, b, month);
            return (
              <div key={c.slug} className="row">
                <span style={{ flex: 1 }}>{c.display_name}</span>
                <b>{c.monthly_rate_cents == null ? "–" : `${usd(c.monthly_rate_cents)}/mo`}</b>
                <span className={`chip ${cls}`}>{txt}</span>
              </div>
            );
          })}
        </div>
      </Pair>
    </>
  );
}

// --- Sales funnel --------------------------------------------------------------------------------

function SalesTab(p: { finance: Finance | null | undefined; weeks: string[]; labels: string[] }) {
  if (!p.finance) return <div className="empty">Finance unavailable.</div>;
  const rows = p.finance.all;
  const s = (k: "calls" | "reached" | "consults" | "pilots" | "signed") =>
    weekTotals(rows, p.weeks, k);
  const calls = s("calls");
  const reached = s("reached");
  const consults = s("consults");
  const pilots = s("pilots");
  // The last step before a win is consult_done ("pilots"): there is no "proposal sent" stamp to count.
  const steps: [string, number[]][] = [
    ["Calls", calls],
    ["Reached", reached],
    ["Consults booked", consults],
    ["Pilots", pilots],
    ["Won", s("signed")],
  ];
  const top = last(calls) || 1;
  return (
    <>
      <Grid>
        <Tile name="Calls" vals={calls} labels={p.labels} fmt={int} goal={GOALS.calls} />
        <Tile name="Reached" vals={reached} labels={p.labels} fmt={int} goal={GOALS.reached} />
        <Tile
          name="Consults booked"
          vals={consults}
          labels={p.labels}
          fmt={int}
          goal={GOALS.consults}
        />
        <Tile name="Pilots" vals={pilots} labels={p.labels} fmt={int} goal={GOALS.pilots} />
      </Grid>
      <Pair>
        <div className="card tile">
          <h2>Calls per week</h2>
          <Cols name="Calls per week" vals={calls} labels={p.labels} fmt={int} goal={GOALS.calls} />
        </div>
        <div>
          <h2>This week&apos;s funnel</h2>
          <div className="card tile funnel">
            {steps.map(([name, v], i) => {
              const n = last(v);
              const before = i ? last(steps[i - 1]?.[1] ?? []) : 0;
              return (
                <div key={name} className="fr">
                  <span>{name}</span>
                  <div>
                    <div
                      className="fb"
                      style={{ width: `${Math.max(2, (n / top) * 100)}%` }}
                      title={String(n)}
                    />
                  </div>
                  <b className="num">{n}</b>
                  <span className="muted num">
                    {i ? `${Math.round((n / (before || 1)) * 100)}%` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Pair>
    </>
  );
}

// --- Ops -----------------------------------------------------------------------------------------

const chipOf = (status: string) =>
  status === "stale" || status === "never_ran" ? "warn" : status === "ok" ? "ok" : "bad";

function ago(iso: string | null, now: Date): string {
  if (!iso) return "no sync yet";
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min}m ago`;
  return min < 2880 ? `${Math.round(min / 60)}h ago` : `${Math.round(min / 1440)}d ago`;
}

export interface OpsProps {
  ops: OpsSnapshot;
  runs: RunEvent[];
  firesSlot: ReactNode;
  instinctUrl?: string;
  sentryUrl?: string;
}

function OpsTab({ o, now }: { o: OpsProps | undefined; now: Date }) {
  if (!o) return <div className="empty">Ops unavailable.</div>;
  const { ops } = o;
  const slugs = [...new Set(ops.health.map((h) => h.slug))].sort();
  const tenant = (slug: string) => {
    const hs = ops.health.filter((h) => h.slug === slug);
    const bad = hs.find((h) => h.status !== "ok");
    const at = hs.map((h) => h.last_success_at ?? "").sort()[hs.length - 1] || null;
    return {
      sources: hs.map((h) => h.source).join(" · "),
      cls: bad ? chipOf(bad.status) : "ok",
      text: bad ? `${bad.source} ${bad.status.replace("_", " ")}` : `synced ${ago(at, now)}`,
    };
  };
  const latest = new Map<string, RunEvent>();
  for (const r of [...o.runs].sort((a, b) => b.at.localeCompare(a.at)))
    if (!latest.has(r.job)) latest.set(r.job, r);
  const link = (url?: string) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer">
        open
      </a>
    ) : (
      <span className="muted">–</span>
    );
  return (
    <section id="ops">
      {ops.failed.length ? (
        <p>
          <span className="chip bad">
            Ops unavailable ({ops.failed.join(", ")}): the platform view could not be read.
          </span>
        </p>
      ) : null}
      <Pair>
        <div className="card">
          <table className="ops">
            <thead>
              <tr>
                <th>Client tenant</th>
                <th>Sources</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {slugs.map((slug) => {
                const t = tenant(slug);
                return (
                  <tr key={slug}>
                    <td>{slug}</td>
                    <td className="muted">{t.sources}</td>
                    <td>
                      <span className={`dot ${t.cls}`} />
                      {t.text}
                    </td>
                  </tr>
                );
              })}
              {slugs.length ? null : (
                <tr>
                  <td colSpan={3} className="muted">
                    {ops.failed.length ? "Unavailable." : "No connectors."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <table className="ops">
            <thead>
              <tr>
                <th>HQ job</th>
                <th>Last run</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...latest.values()].map((r) => (
                <tr key={r.job}>
                  <td>
                    <span className={`dot ${r.ok ? "ok" : "bad"}`} />
                    {r.job}
                  </td>
                  <td className="num">{r.at.slice(5, 16).replace("T", " ")}</td>
                  <td className="muted">{r.ok ? "ok" : (r.error ?? "failed")}</td>
                </tr>
              ))}
              {latest.size ? null : (
                <tr>
                  <td colSpan={3} className="muted">
                    No runs in the last 24h.
                  </td>
                </tr>
              )}
              <tr>
                <td>Open tickets</td>
                <td className="num">
                  <b>{ops.failed.length ? "–" : ops.tickets.length}</b>
                </td>
                <td />
              </tr>
              <tr>
                <td>Sentry issues (7d)</td>
                <td />
                <td>{link(o.sentryUrl)}</td>
              </tr>
              <tr>
                <td>Instinct queue</td>
                <td />
                <td>{link(o.instinctUrl)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Pair>
      <h2 className="gap">Fires</h2>
      {o.firesSlot}
    </section>
  );
}

// --- Unit economics ------------------------------------------------------------------------------

function UnitTab(p: {
  finance: Finance | null | undefined;
  clients: NumbersClient[] | null | undefined;
  weeks: string[];
  labels: string[];
}) {
  if (!p.finance || !p.clients)
    return (
      <div className="empty">
        Unit economics unavailable: {p.finance ? "clients" : "finance"} could not be read.
      </div>
    );
  const paying = p.clients.filter((c) => !c.churn_date && (c.monthly_rate_cents ?? 0) > 0);
  const avg = paying.length
    ? Math.round(paying.reduce((s, c) => s + (c.monthly_rate_cents ?? 0), 0) / paying.length)
    : 0;
  const u = unitEconomics(p.finance.all, p.weeks, avg);
  const n = u.now;
  const { labels } = p;
  return (
    <>
      <Grid>
        <Tile
          labels={labels}
          name="CAC"
          vals={u.series.cac}
          fmt={usd}
          lowGood
          value={usd(n.cacCents)}
        />
        <Tile labels={labels} name="LTV" vals={u.series.ltv} fmt={usd} />
        <Tile
          labels={labels}
          name="LTV : CAC"
          vals={u.series.ratio}
          fmt={times}
          goal={3}
          value={n.ratio == null ? "–" : times(n.ratio)}
        />
        <Tile labels={labels} name="Gross margin" vals={u.series.margin} fmt={pct} goal={75} />
      </Grid>
      <Pair>
        <div className="card tile">
          <h2>LTV : CAC</h2>
          <Cols name="LTV : CAC" vals={u.series.ratio} labels={labels} fmt={times} goal={3} />
        </div>
        <div className="card tile">
          <h2>Inputs</h2>
          <p className="note">
            Sales spend (90d) <b>{usd(n.spendCents)}</b> · new clients (90d) <b>{n.newClients}</b> ·
            avg rate <b>{usd(n.avgRateCents)}</b> · expected months <b>{UNIT.expectedMonths}</b> ·
            infra per client <b>{usd(UNIT.infraCents)}/mo</b>
          </p>
          <button
            type="button"
            className="btn"
            disabled
            title="Assumptions live in lib/finance.ts for now"
          >
            Edit assumptions
          </button>
        </div>
      </Pair>
    </>
  );
}

// --- page ----------------------------------------------------------------------------------------

export interface NumbersViewProps {
  tab: Tab;
  /** Only the active tab's data is loaded; a missing group renders as "unavailable". */
  money?: MoneyProps;
  /** null when the finance queries failed. */
  finance?: Finance | null;
  /** null when the clients query failed. */
  clients?: NumbersClient[] | null;
  ops?: OpsProps;
  now?: Date;
}

export function NumbersView(p: NumbersViewProps) {
  const now = p.now ?? new Date();
  const thisWeek = nyWeek(now);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(thisWeek, -7 * (WEEKS - 1 - i)));
  const labels = weeks.map(dayLabel);
  const today = now.toISOString().slice(0, 10);
  const sub = TABS.find((t) => t[0] === p.tab)?.[2];
  return (
    <div className="lpad nm">
      <h1>Numbers</h1>
      <p className="sub">
        Week of {dayLabel(thisWeek)} · {sub}
      </p>
      <nav className="ntabs" aria-label="Numbers sections">
        {TABS.map(([id, name]) => (
          <a
            key={id}
            href={`/numbers?tab=${id}`}
            className={id === p.tab ? "on" : undefined}
            aria-current={id === p.tab ? "page" : undefined}
          >
            {name}
          </a>
        ))}
      </nav>
      {p.tab === "money" ? (
        <MoneyTab m={p.money} clients={p.clients} weeks={weeks} labels={labels} today={today} />
      ) : null}
      {p.tab === "sales" ? <SalesTab finance={p.finance} weeks={weeks} labels={labels} /> : null}
      {p.tab === "ops" ? <OpsTab o={p.ops} now={now} /> : null}
      {p.tab === "unit" ? (
        <UnitTab finance={p.finance} clients={p.clients} weeks={weeks} labels={labels} />
      ) : null}
    </div>
  );
}
