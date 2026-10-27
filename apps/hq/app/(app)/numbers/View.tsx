import type { ReactNode } from "react";
import type { DeltaKey, MonthView, WithDeltas } from "@/lib/finance";
import { ASSUMPTIONS, LTV_CENTS } from "@/lib/finance";
import {
  isUnavailable,
  type MercurySummary,
  type StripeSummary,
  type Unavailable,
} from "@/lib/money";
import type { OpsSnapshot, RunEvent } from "@/lib/ops";
import type { Finance } from "./data";

const usd = (c: number | null) =>
  c == null ? "–" : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const ratio = (r: number | null) => (r == null ? "–" : `${r.toFixed(1)}x`);

function Delta({ v, money }: { v: number | null; money?: boolean }) {
  if (v == null || v === 0) return null;
  const txt = money ? usd(Math.abs(v)) : Math.abs(Math.round(v * 100) / 100).toString();
  return (
    <small className={`dl ${v > 0 ? "up" : "dn"}`}>
      {v > 0 ? "▲" : "▼"}
      {txt}
    </small>
  );
}

function Cell({ r, k, v, money }: { r: WithDeltas; k: DeltaKey; v: string; money?: boolean }) {
  return (
    <td className="num">
      {v}
      <Delta v={r.deltas[k]} money={money} />
    </td>
  );
}

function FinanceRows({ rows, label }: { rows: WithDeltas[]; label: (r: WithDeltas) => string }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.period + r.channel}>
          <td>{label(r)}</td>
          <td>{r.channel}</td>
          <Cell r={r} k="calls" v={String(r.calls)} />
          <Cell r={r} k="reached" v={String(r.reached)} />
          <Cell r={r} k="consults" v={String(r.consults)} />
          <Cell r={r} k="leads" v={String(r.leads)} />
          <Cell r={r} k="pilots" v={String(r.pilots)} />
          <Cell r={r} k="signed" v={String(r.signed)} />
          <Cell r={r} k="spendCents" v={usd(r.spendCents)} money />
          <Cell r={r} k="costPerLeadCents" v={usd(r.costPerLeadCents)} money />
          <Cell r={r} k="costPerSignedCents" v={usd(r.costPerSignedCents)} money />
          <Cell r={r} k="cacCents" v={usd(r.cacCents)} money />
          <Cell r={r} k="ltvCac" v={ratio(r.ltvCac)} />
        </tr>
      ))}
    </>
  );
}

const HEAD = [
  "",
  "Channel",
  "Calls",
  "Reached",
  "Consults",
  "Leads",
  "Pilots",
  "Signed",
  "Spend",
  "$/lead",
  "$/signed",
  "CAC",
  "LTV:CAC",
];

function Head({ first }: { first: string }) {
  return (
    <thead>
      <tr>
        {HEAD.map((h, i) => (
          <th key={i} className={i > 1 ? "num" : undefined}>
            {i === 0 ? first : h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Monthly({
  months,
  freeze,
}: {
  months: MonthView[];
  freeze?: (fd: FormData) => Promise<void>;
}) {
  if (!months.length) return <div className="empty">No months yet.</div>;
  return (
    <>
      {months.map((m) => (
        <div key={m.month} className="card mblk">
          <div className="mhead">
            <b>{m.month.slice(0, 7)}</b>{" "}
            <span className={`chip ${m.frozen ? "ok" : "warn"}`}>
              {m.frozen ? "frozen" : "live, not frozen"}
            </span>
            {!m.frozen && freeze ? (
              <form action={freeze} className="inl">
                <input type="hidden" name="month" value={m.month} />
                <button type="submit" className="btn sm">
                  Freeze {m.month.slice(0, 7)}
                </button>
              </form>
            ) : null}
          </div>
          <div className="tw">
            <table className="tbl">
              <Head first="Month" />
              <tbody>
                <FinanceRows rows={m.rows} label={(r) => r.period.slice(0, 7)} />
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function Money({
  stripe,
  mercury,
}: {
  stripe: StripeSummary | Unavailable;
  mercury: MercurySummary | Unavailable;
}) {
  return (
    <div className="stats">
      {isUnavailable(stripe) ? (
        <span className="stat">
          Stripe <b>unavailable</b>
        </span>
      ) : (
        <>
          <span className="stat">
            <b>{usd(stripe.mrrCents)}</b> MRR · {stripe.activeSubscriptions} subs
          </span>
          <span className="stat">
            <b>{usd(stripe.charges30dCents)}</b> Stripe charges 30d
          </span>
        </>
      )}
      {isUnavailable(mercury) ? (
        <span className="stat">
          Mercury <b>unavailable</b>
        </span>
      ) : (
        <>
          <span className="stat">
            <b>{usd(mercury.balanceCents)}</b> Mercury balance
          </span>
          <span className="stat">
            <b>{usd(mercury.in30dCents)}</b> in 30d
          </span>
          <span className="stat">
            <b>{usd(mercury.out30dCents)}</b> out 30d
          </span>
        </>
      )}
    </div>
  );
}

const chip = (status: string) =>
  status === "ok" ? "ok" : status === "stale" || status === "never_ran" ? "warn" : "bad";

function Ops({
  ops,
  runs,
  instinctUrl,
  sentryUrl,
}: {
  ops: OpsSnapshot;
  runs: RunEvent[];
  instinctUrl?: string;
  sentryUrl?: string;
}) {
  const sources = [...new Set(ops.health.map((h) => h.source))].sort();
  const slugs = [...new Set(ops.health.map((h) => h.slug))].sort();
  const cell = (slug: string, source: string) =>
    ops.health.find((h) => h.slug === slug && h.source === source);
  return (
    <section id="ops" className="sec">
      <h2>Ops</h2>
      {ops.failed.length ? (
        <p className="note">
          Ops unavailable ({ops.failed.join(", ")}): the platform view could not be read.
        </p>
      ) : null}
      {instinctUrl || sentryUrl ? (
        <p className="note">
          {instinctUrl ? (
            <a className="lnkb" href={instinctUrl} target="_blank" rel="noreferrer">
              Instinct
            </a>
          ) : null}{" "}
          {sentryUrl ? (
            <a className="lnkb" href={sentryUrl} target="_blank" rel="noreferrer">
              Sentry
            </a>
          ) : null}
        </p>
      ) : null}
      <h3>Connectors</h3>
      {slugs.length ? (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tenant</th>
                {sources.map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slugs.map((slug) => (
                <tr key={slug}>
                  <td>{slug}</td>
                  {sources.map((s) => {
                    const h = cell(slug, s);
                    return (
                      <td key={s}>
                        {h ? <span className={`chip ${chip(h.status)}`}>{h.status}</span> : "–"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{ops.failed.length ? "Unavailable." : "No connectors."}</div>
      )}
      <h3>HQ job runs (24h)</h3>
      {runs.length ? (
        <div className="card">
          {runs.slice(0, 20).map((r, i) => (
            <div key={r.job + r.at + i} className="row">
              <div className="rb">
                <div className="r1">
                  <span className="rt">{r.job}</span>
                  <span className={`chip ${r.ok ? "ok" : "bad"}`}>{r.ok ? "ok" : "failed"}</span>
                </div>
                <div className="r2">
                  {r.at.slice(0, 16).replace("T", " ")}
                  {r.error ? ` · ${r.error}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No runs in the last 24h.</div>
      )}
      <h3>Open tickets</h3>
      {ops.tickets.length ? (
        <div className="card">
          {ops.tickets.map((t) => (
            <div key={t.id} className="row">
              <div className="rb">
                <div className="r1">
                  <span className="rt">{t.subject}</span>
                  <span
                    className={`chip ${t.severity === "urgent" || t.severity === "high" ? "bad" : "stage"}`}
                  >
                    {t.severity}
                  </span>
                </div>
                <div className="r2">{t.slug}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">{ops.failed.length ? "Unavailable." : "No open tickets."}</div>
      )}
    </section>
  );
}

export interface NumbersViewProps {
  /** null when the finance queries failed. */
  finance: Finance | null;
  ops: OpsSnapshot;
  runs: RunEvent[];
  stripe: StripeSummary | Unavailable;
  mercury: MercurySummary | Unavailable;
  firesSlot: ReactNode;
  freeze?: (fd: FormData) => Promise<void>;
  instinctUrl?: string;
  sentryUrl?: string;
}

export function NumbersView(p: NumbersViewProps) {
  return (
    <div className="lpad">
      <h1>Numbers</h1>
      <h2>Fires</h2>
      {p.firesSlot}
      <h2>Money</h2>
      <Money stripe={p.stripe} mercury={p.mercury} />
      <h2>Weekly (live)</h2>
      {p.finance ? (
        <div className="tw">
          <table className="tbl">
            <Head first="Week" />
            <tbody>
              <FinanceRows rows={p.finance.weekly} label={(r) => r.period} />
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">Finance unavailable.</div>
      )}
      <h2>Monthly</h2>
      {p.finance ? (
        <Monthly months={p.finance.months} freeze={p.freeze} />
      ) : (
        <div className="empty">Finance unavailable.</div>
      )}
      <p className="note">
        LTV {usd(LTV_CENTS)} = ARPU {usd(ASSUMPTIONS.arpuCents)} x {ASSUMPTIONS.margin * 100}%
        margin / {ASSUMPTIONS.monthlyChurn * 100}% monthly churn. CAC adds{" "}
        {usd(ASSUMPTIONS.hourCents)}/hour. Edit lib/finance.ts.
      </p>
      <Ops ops={p.ops} runs={p.runs} instinctUrl={p.instinctUrl} sentryUrl={p.sentryUrl} />
    </div>
  );
}
