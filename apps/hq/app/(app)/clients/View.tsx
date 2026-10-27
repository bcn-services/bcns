import type { ReactNode } from "react";
import { Board, type Row, type Section } from "@/components/Board";
import type { ClientBilling } from "@/lib/money";

export interface ClientRow {
  slug: string;
  display_name: string;
  kind: string | null;
  stage: string | null;
  health: string | null;
  owner: string | null;
  channel: string | null;
  billing_note: string | null;
  repo_url: string | null;
  monthly_rate_cents: number | null;
  links: { label: string | null; url: string }[];
  billing: ClientBilling;
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** One-line billing status for the list. */
export function billingLabel(b: ClientBilling): string {
  if (!b.mercury) return b.note ? `note: ${b.note.slice(0, 40)}` : "billing unavailable";
  if (b.invoice?.overdue) return `${b.invoice.overdue} overdue`;
  if (b.lastPaid) return `paid ${b.lastPaid.at.slice(0, 10)} ${usd(b.lastPaid.amountCents)}`;
  return "no payment found";
}

const SECTIONS: { id: string; title: string; hot?: boolean }[] = [
  { id: "red", title: "Red", hot: true },
  { id: "amber", title: "Amber", hot: true },
  { id: "green", title: "Green" },
  { id: "none", title: "No health set" },
];

function Edit({ c, action }: { c: ClientRow; action?: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="eform">
      <input type="hidden" name="slug" value={c.slug} />
      <label>
        Health
        <select name="health" defaultValue={c.health ?? ""}>
          <option value="">not set</option>
          <option value="green">green</option>
          <option value="amber">amber</option>
          <option value="red">red</option>
        </select>
      </label>
      <label>
        Stage
        <input name="stage" defaultValue={c.stage ?? ""} maxLength={60} />
      </label>
      <label>
        Owner
        <input name="owner" defaultValue={c.owner ?? ""} maxLength={60} />
      </label>
      <label>
        Billing note
        <textarea
          name="billing_note"
          defaultValue={c.billing_note ?? ""}
          maxLength={500}
          rows={3}
        />
      </label>
      <div className="acts">
        <button type="submit" className="btn pri sm">
          Save
        </button>
      </div>
    </form>
  );
}

export function ClientDetail({
  c,
  action,
  invoicing,
}: {
  c: ClientRow;
  action?: (fd: FormData) => Promise<void>;
  invoicing: boolean;
}) {
  const b = c.billing;
  return (
    <>
      <dl>
        <dt>Billing</dt>
        <dd>{billingLabel(b)}</dd>
        {c.monthly_rate_cents ? (
          <>
            <dt>Monthly rate</dt>
            <dd>{usd(c.monthly_rate_cents)}</dd>
          </>
        ) : null}
        {b.invoice ? (
          <>
            <dt>Next invoice due</dt>
            <dd>{b.invoice.nextDue ?? "none open"}</dd>
          </>
        ) : invoicing ? (
          <>
            <dt>Invoices</dt>
            <dd>unavailable</dd>
          </>
        ) : null}
        {b.note ? (
          <>
            <dt>Note</dt>
            <dd>{b.note}</dd>
          </>
        ) : null}
      </dl>
      {c.repo_url || c.links.length ? (
        <p className="acts">
          {c.repo_url ? (
            <a className="lnkb" href={c.repo_url} target="_blank" rel="noreferrer">
              Repo
            </a>
          ) : null}
          {c.links.map((l) => (
            <a key={l.url} className="lnkb" href={l.url} target="_blank" rel="noreferrer">
              {l.label || l.url}
            </a>
          ))}
        </p>
      ) : null}
      <Edit c={c} action={action} />
    </>
  );
}

export function ClientsView({
  clients,
  mercuryUnavailable,
  invoicing,
  action,
}: {
  clients: ClientRow[];
  /** Mercury could not be read: billing falls back to the note. */
  mercuryUnavailable: boolean;
  invoicing: boolean;
  action?: (fd: FormData) => Promise<void>;
}) {
  const sections: Section[] = SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    hot: s.hot,
    rows: clients
      .filter((c) => (c.health ?? "none") === s.id)
      .map((c): Row => ({
        key: c.slug,
        title: c.display_name,
        meta: [c.kind, c.stage, c.owner, c.channel].filter(Boolean).join(" · "),
        right: billingLabel(c.billing),
      })),
  }));
  const details: Record<string, ReactNode> = Object.fromEntries(
    clients.map((c) => [
      c.slug,
      <ClientDetail key={c.slug} c={c} action={action} invoicing={invoicing} />,
    ])
  );
  return (
    <Board
      head={
        <>
          <h1>Clients</h1>
          {mercuryUnavailable ? (
            <p className="note">Mercury unavailable: billing shows notes only.</p>
          ) : null}
        </>
      }
      sections={sections}
      details={details}
      emptyText="No clients."
    />
  );
}
