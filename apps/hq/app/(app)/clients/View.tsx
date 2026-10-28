"use client";

import { useState } from "react";
import { DOT, type Dot } from "@/lib/clients/health";
import { BILLING_SOURCES } from "@/lib/clients/fields";
import type { ClientCard } from "@/lib/clients/load";
import { OWNERS } from "@/lib/tasks";
import type { ActionResult } from "./actions";

type Act = (fd: FormData) => Promise<ActionResult>;
type Filter = "all" | Dot;

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const https = (u: string) => u.startsWith("https://"); // never render a javascript: or http: href
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export const GROUPS: { dot: Dot; name: string }[] = [
  { dot: "r", name: "Down / needs attention" },
  { dot: "a", name: "Watch" },
  { dot: "g", name: "Healthy" },
];
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["r", "Down"],
  ["a", "Watch"],
  ["g", "Healthy"],
];

/** The list the left panel draws: red, amber, green; filtered by the health chips and the search box. */
export function groupCards(cards: ClientCard[], filter: Filter, q: string) {
  const needle = q.trim().toLowerCase();
  return GROUPS.filter((g) => filter === "all" || filter === g.dot)
    .map((g) => ({
      ...g,
      cards: cards.filter(
        (c) =>
          DOT[c.derived.health] === g.dot &&
          (!needle || c.display_name.toLowerCase().includes(needle))
      ),
    }))
    .filter((g) => g.cards.length);
}

/** Contracted MRR of the list: clients billed through Mercury or Stripe (billing_source none = not billed here). */
export const listMrr = (cards: ClientCard[]) =>
  cards.reduce((t, c) => t + (c.billing_source === "none" ? 0 : (c.monthly_rate_cents ?? 0)), 0);

const matchedBy = (c: ClientCard) =>
  c.mercury_customer_id
    ? "matched by Mercury customer"
    : c.aliases?.length
      ? "matched by alias"
      : "no match key set";

function Money({ c, month }: { c: ClientCard; month: string }) {
  const pay = c.derived.payment;
  const status = {
    paid: ["Paid", "received"],
    unpaid: ["—", "not found"],
    unknown: ["?", "unverifiable"],
    "n/a": ["n/a", "not billed here"],
  }[pay];
  return (
    <div className="card tl">
      <h2>Money</h2>
      <div className="mstats">
        <div>
          <div className="big">
            {c.monthly_rate_cents == null ? "—" : usd(c.monthly_rate_cents)}
          </div>
          <div className="muted">per month</div>
        </div>
        <div>
          <div className="big">{status[0]}</div>
          <div className="muted">
            {month} payment {status[1]}
          </div>
        </div>
        <div>
          <div className="big">{c.lifetime ? usd(c.lifetime.cents) : "—"}</div>
          <div className="muted">lifetime{c.lifetime?.est ? " (est.)" : ""}</div>
        </div>
      </div>
      <div className="muted foot">
        {c.billing_source ?? "mercury"} · next invoice{" "}
        {c.billing.invoice?.nextDue ? day(c.billing.invoice.nextDue) : "—"} · {matchedBy(c)}
      </div>
      {c.billing.note ? <div className="muted foot">{c.billing.note}</div> : null}
    </div>
  );
}

function Work({ c, action }: { c: ClientCard; action: Act }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const w = c.work;
  return (
    <div className="card tl">
      <h2>Work</h2>
      <div className="strong">{c.stage ?? "Stage not set"}</div>
      <div className="bar">
        <i style={{ width: `${w.total ? (w.done / w.total) * 100 : 0}%` }} />
      </div>
      <div className="muted">
        {w.total
          ? `${w.done} of ${w.total} · next: ${w.next ?? "nothing open"} · ${w.open} open task${w.open === 1 ? "" : "s"}`
          : "No tasks yet"}
      </div>
      <div className="act">
        {open ? (
          <form
            className="inline"
            action={async (fd) => {
              const r = await action(fd);
              if (r.ok) {
                setOpen(false);
                setErr("");
              } else setErr(r.error);
            }}
          >
            <input type="hidden" name="slug" value={c.slug} />
            <input
              name="title"
              placeholder="What needs doing"
              required
              maxLength={200}
              aria-label="Task title"
              autoFocus
            />
            <select name="owner" defaultValue="nate" aria-label="Owner">
              {OWNERS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <button className="btn pri" type="submit">
              Add
            </button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            {err ? <span className="bad">{err}</span> : null}
          </form>
        ) : (
          <button className="btn" type="button" onClick={() => setOpen(true)}>
            + Task for this client
          </button>
        )}
      </div>
    </div>
  );
}

function Files({ c }: { c: ClientCard }) {
  const rows = [
    ...c.links
      .filter((l) => https(l.url))
      .map((l) => ({ name: l.label || host(l.url), url: l.url })),
    ...(c.repo_url && https(c.repo_url) ? [{ name: "Repo", url: c.repo_url }] : []),
    ...(c.appUrl ? [{ name: "Their app", url: c.appUrl }] : []),
  ];
  return (
    <div className="card tl">
      <h2>Files + links</h2>
      {rows.length ? (
        rows.map((r) => (
          <div className="src" key={r.url}>
            <b>{r.name}</b>
            <a className="btn" href={r.url} target="_blank" rel="noopener noreferrer">
              Open ↗
            </a>
          </div>
        ))
      ) : (
        <div className="muted">No links yet.</div>
      )}
    </div>
  );
}

export function EditForm({
  c,
  action,
  onDone,
}: {
  c: ClientCard;
  action: Act;
  onDone: () => void;
}) {
  const [err, setErr] = useState("");
  return (
    <form
      className="card tl edit"
      action={async (fd) => {
        const r = await action(fd);
        if (r.ok) onDone();
        else setErr(r.error);
      }}
    >
      <input type="hidden" name="slug" value={c.slug} />
      <label>
        Monthly rate ($)
        <input
          name="monthly_rate"
          inputMode="decimal"
          defaultValue={c.monthly_rate_cents == null ? "" : String(c.monthly_rate_cents / 100)}
        />
      </label>
      <label>
        Billing source
        <select name="billing_source" defaultValue={c.billing_source ?? "mercury"}>
          {BILLING_SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Mercury customer id
        <input
          name="mercury_customer_id"
          defaultValue={c.mercury_customer_id ?? ""}
          maxLength={100}
        />
      </label>
      <label>
        Aliases (payer names, one per line)
        <textarea name="aliases" rows={2} defaultValue={(c.aliases ?? []).join("\n")} />
      </label>
      <label>
        Repo URL
        <input name="repo_url" defaultValue={c.repo_url ?? ""} maxLength={300} />
      </label>
      <label>
        Launch date
        <input name="launch_date" type="date" defaultValue={c.launch_date ?? ""} />
      </label>
      <label>
        Notes
        <textarea name="notes" rows={3} defaultValue={c.notes ?? ""} maxLength={2000} />
      </label>
      <div className="act">
        <button className="btn pri" type="submit">
          Save
        </button>
        <button className="btn" type="button" onClick={onDone}>
          Cancel
        </button>
        {err ? <span className="bad">{err}</span> : null}
      </div>
    </form>
  );
}

export function ClientDetail({
  c,
  admin,
  month,
  editAction,
  taskAction,
}: {
  c: ClientCard;
  admin: boolean;
  month: string;
  editAction: Act;
  taskAction: Act;
}) {
  const [editing, setEditing] = useState(false);
  const dot = DOT[c.derived.health];
  return (
    <div className="det">
      <div className="muted">
        client{c.monthly_rate_cents != null ? ` · ${usd(c.monthly_rate_cents)}/mo` : ""}
      </div>
      <div className="dh">
        <span className={`dot ${dot}`} aria-hidden />
        <h1>{c.display_name}</h1>
        {admin && !editing ? (
          <button className="btn" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
      </div>
      <div className="why">Health: {c.derived.why}</div>
      {editing ? <EditForm c={c} action={editAction} onDone={() => setEditing(false)} /> : null}
      <div className="grid2">
        <div className="card tl">
          <h2>App + connectors</h2>
          {c.derived.sources.length ? (
            c.derived.sources.map((s) => (
              <div className="src" key={s.name}>
                <span className={`dot ${s.dot}`} aria-hidden />
                <b>{s.name}</b>
                <span className="muted">{s.note}</span>
              </div>
            ))
          ) : (
            <div className="muted">Nothing connected yet.</div>
          )}
          <div className="act">
            <a
              className="btn"
              href="https://connect.bcn-services.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Connect ↗
            </a>
          </div>
        </div>
        <Money c={c} month={month} />
        <Work c={c} action={taskAction} />
        <Files c={c} />
      </div>
    </div>
  );
}

export function ClientsView({
  cards,
  admin,
  month,
  editAction,
  taskAction,
}: {
  cards: ClientCard[];
  admin: boolean;
  month: string;
  editAction: Act;
  taskAction: Act;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const groups = groupCards(cards, filter, q);
  const [sel, setSel] = useState<string | null>(null);
  const shown = cards.find((c) => c.slug === sel) ?? groups[0]?.cards[0] ?? cards[0];
  return (
    <div className="cx">
      <div className="cx-list">
        <div className="cx-head">
          <h1>Clients</h1>
          <p className="sub">
            {cards.length} · MRR {usd(listMrr(cards))}
          </p>
          <input
            className="srch"
            placeholder="Search clients"
            aria-label="Search clients"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="hf">
            {FILTERS.map(([k, n]) => (
              <button
                key={k}
                type="button"
                className={`btn${k === filter ? " on" : ""}`}
                onClick={() => setFilter(k)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.dot}>
            <div className="gh">
              <span className={`dot ${g.dot}`} aria-hidden />
              {g.name}
              <span className="muted">{g.cards.length}</span>
            </div>
            {g.cards.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={`cl${c.slug === shown?.slug ? " f" : ""}`}
                onClick={() => setSel(c.slug)}
              >
                <span className="cl-main">
                  <span className="cl-name">{c.display_name}</span>
                  <span className="muted rt">{c.derived.why}</span>
                </span>
                <span className="muted">
                  {c.monthly_rate_cents == null ? "" : usd(c.monthly_rate_cents)}
                </span>
              </button>
            ))}
          </div>
        ))}
        {!groups.length ? (
          <p className="muted cx-empty">{cards.length ? "No clients match." : "No clients yet."}</p>
        ) : null}
      </div>
      {shown ? (
        <ClientDetail
          key={shown.slug}
          c={shown}
          admin={admin}
          month={month}
          editAction={editAction}
          taskAction={taskAction}
        />
      ) : (
        <div className="det muted">No clients yet.</div>
      )}
    </div>
  );
}
