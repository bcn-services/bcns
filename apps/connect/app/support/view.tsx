/** @jsxRuntime automatic */
import { cn } from "@bcn-services/ui";
import { SendButton } from "./send-button";
import { formatDateTime } from "@/lib/data-format";
import {
  BODY_MAX,
  ERROR_MESSAGES,
  SEVERITIES,
  SEVERITY_LABEL,
  STATUS_LABEL,
  SUBJECT_MAX,
  type TicketRow,
} from "@/lib/support";

/** A ticket row plus bcns's reply (set when HQ closes the ticket; null until then). */
export type SupportTicket = TicketRow & { resolution?: string | null; resolved_at?: string | null };

const TONE: Record<string, string> = { answered: "st-ok", closed: "st-idle" };

export interface SupportViewProps {
  tickets: SupportTicket[];
  /** The history query failed (for example the migration is not applied yet). */
  historyFailed?: boolean;
  /** `sent` from the redirect: "1" emailed, "mailto" no key, "failed" send failed. */
  sent?: string;
  error?: string;
  /** mailto: for the ticket just saved, when the email did not go out. */
  mailto: string | null;
  timezone?: string | null;
  action: (form: FormData) => void | Promise<void>;
}

/** Presentational: the page loads the rows, this draws them (and renders to static markup in tests). */
export function SupportView({ tickets, historyFailed, sent, error, mailto, timezone, action }: SupportViewProps) {
  return (
    <div className="pg">
      <section className="phead" aria-labelledby="support-h">
        <h1 id="support-h" className="page-title">
          Get help
        </h1>
        <p className="sum">Tell us what&apos;s wrong. We reply by email.</p>
      </section>

      {sent === "1" ? (
        <p role="status" className="note">
          Sent. We&apos;ll reply by email.
        </p>
      ) : null}
      {sent === "mailto" || sent === "failed" ? (
        <p role="alert" className="note note-alert">
          {sent === "failed"
            ? "Your ticket is saved, but the email to bcns didn't go out."
            : "Your ticket is saved, but this server can't send email."}{" "}
          {mailto ? (
            <>
              Send it from your own mail so we see it:
              <a className="btn btn-out btn-sm" href={mailto}>
                Email bcns
              </a>
            </>
          ) : (
            "Email nseluga@bcn-services.com so we see it."
          )}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="note note-alert">
          {ERROR_MESSAGES[error] ?? ERROR_MESSAGES.failed}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="new-ticket-h">
        <h2 id="new-ticket-h">New ticket</h2>
        <form action={action} className="tk-form">
          <label className="field" htmlFor="tk-subject">
            Subject
            <input id="tk-subject" name="subject" type="text" required maxLength={SUBJECT_MAX} autoComplete="off" />
          </label>
          <label className="field" htmlFor="tk-body">
            What happened?
            <textarea id="tk-body" name="body" required maxLength={BODY_MAX} rows={6} />
          </label>
          <label className="field" htmlFor="tk-severity">
            How urgent?
            <select id="tk-severity" name="severity" defaultValue="normal">
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <SendButton />
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="history-h">
        <h2 id="history-h">Your tickets</h2>
        {historyFailed ? (
          <p className="sub">We couldn&apos;t load your tickets just now.</p>
        ) : tickets.length === 0 ? (
          <p className="sub">Nothing yet.</p>
        ) : (
          <ul className="mlist tk-list">
            {tickets.map((t) => (
              <li key={t.id} className="mem">
                <span className="tk-s">{t.subject}</span>
                <span className={cn("st", TONE[t.status])}>{STATUS_LABEL[t.status] ?? t.status}</span>
                <time className="tiny" dateTime={t.created_at}>
                  {formatDateTime(t.created_at, timezone ?? undefined).slice(0, 10)}
                </time>
                {t.resolution ? (
                  <div className="basis-full whitespace-pre-line text-sm">
                    <p className="tiny">
                      {`Reply from bcns${t.resolved_at ? ` · ${formatDateTime(t.resolved_at, timezone ?? undefined).slice(0, 10)}` : ""}`}
                    </p>
                    <p>{t.resolution}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
