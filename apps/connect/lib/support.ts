/**
 * support.ts — /support: a member writes to bcns from the hub.
 *
 * The row (api.ticket_create, 20261023175413_support_tickets.sql) is the record; the Resend mail to
 * Nate is the delivery, built on the request-connection helpers. Order matters: the row is written
 * FIRST, so a send that fails never loses the ticket. RESEND_API_KEY is optional here as everywhere:
 * with no key the page offers a mailto: instead. Pure: the api and fetch are injected, so tests run
 * without Next, Supabase or the network.
 *
 * Everything the member typed ends up in an email header (subject, and Reply-To is their account
 * email). Control characters are stripped from every header value, the body goes only in the text.
 */
import { BCNS_EMAIL, REQUEST_FROM, sendMail, type RequestDeps, type ResendEmail } from "./request-connection";

export const SEVERITIES = ["low", "normal", "urgent"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low: a question",
  normal: "Normal",
  urgent: "Urgent: something is broken",
};
/** Same numbers as the check constraints in the migration. */
export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;
/** A mailto: URL past ~2000 characters is cut by some mail apps; the full text is in the database. */
export const MAILTO_BODY_MAX = 1500;

export const STATUS_LABEL: Record<string, string> = { open: "Open", answered: "Answered", closed: "Closed" };

export interface TicketRow {
  id: string;
  subject: string;
  body: string;
  severity: string;
  status: string;
  created_at: string;
}

export interface TicketMail {
  id: string;
  subject: string;
  body: string;
  severity: string;
  clientSlug: string;
  clientName: string | null;
  requesterEmail: string | null;
}

/** One line, no control characters (CR, LF, tab, NUL, U+2028/9 all become a space). */
export function oneLine(value: string): string {
  return value.replace(/[\p{Cc}\u2028\u2029]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** A plain address for Reply-To, or null: anything with a space, comma, angle bracket or quote is dropped, not repaired. */
export function replyToAddress(email: string | null): string | null {
  if (!email || email !== email.trim()) return null;
  return /^[^\s@<>,;"']+@[^\s@<>,;"']+$/.test(email) && email.length <= 254 ? email : null;
}

export function ticketSubject(t: Pick<TicketMail, "clientSlug" | "subject">): string {
  return `[Connect ticket ${oneLine(t.clientSlug)}] ${oneLine(t.subject)}`;
}

function ticketText(t: TicketMail, bodyMax: number): string {
  const workspace = t.clientName ? `${oneLine(t.clientName)} (${oneLine(t.clientSlug)})` : oneLine(t.clientSlug);
  return [
    `Severity: ${oneLine(t.severity)}`,
    `Workspace: ${workspace}`,
    `Ticket: ${t.id}`,
    `From: ${t.requesterEmail ?? "unknown"}`,
    "",
    t.body.slice(0, bodyMax),
  ].join("\n");
}

export function ticketEmail(t: TicketMail): ResendEmail {
  const replyTo = replyToAddress(t.requesterEmail);
  return {
    from: REQUEST_FROM,
    to: [BCNS_EMAIL],
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: ticketSubject(t),
    text: ticketText(t, BODY_MAX),
  };
}

/** The same ticket as a mailto:, for the no-key and failed-send paths. */
export function ticketMailto(t: TicketMail): string {
  // encodeURIComponent, not URLSearchParams: that writes a space as "+", which a mail app shows literally.
  return `mailto:${BCNS_EMAIL}?subject=${encodeURIComponent(ticketSubject(t))}&body=${encodeURIComponent(ticketText(t, MAILTO_BODY_MAX))}`;
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the form gave us, checked the way the database will check it. Null field = the field name that failed. */
export function parseTicketForm(form: FormData): { subject: string; body: string; severity: Severity } | { field: "subject" | "body" | "severity" } {
  const rawSubject = form.get("subject");
  const rawBody = form.get("body");
  const rawSeverity = form.get("severity");
  const subject = typeof rawSubject === "string" ? oneLine(rawSubject) : "";
  const body = typeof rawBody === "string" ? rawBody.replace(/\r\n?/g, "\n").trim() : "";
  if (!subject || subject.length > SUBJECT_MAX) return { field: "subject" };
  if (!body || body.length > BODY_MAX) return { field: "body" };
  const severity = rawSeverity === null || rawSeverity === "" ? "normal" : rawSeverity;
  if (!isSeverity(severity)) return { field: "severity" };
  return { subject, body, severity };
}

export interface RpcError {
  code?: string;
  message?: string;
  details?: string | null;
}

export interface TicketApi {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export interface CreateDeps extends RequestDeps {
  api: TicketApi;
  requesterEmail: string | null;
  clientName: string | null;
}

export const ERROR_MESSAGES: Record<string, string> = {
  subject: `Add a subject, up to ${SUBJECT_MAX} characters.`,
  body: `Tell us what's wrong, up to ${BODY_MAX} characters.`,
  severity: "Pick how urgent it is.",
  rate: "That's a lot of tickets in an hour. Wait a bit, or email bcns directly.",
  failed: "That didn't save. Try again, or email bcns.",
};

export function errorFlag(error: RpcError): string {
  if (error.code === "BCNS9") return "rate";
  if (error.code === "BCNS3" && ["subject", "body", "severity"].includes(error.details ?? "")) return error.details as string;
  return "failed";
}

/**
 * Validate, record, then email. Returns the path to redirect to:
 *   /support?error=<flag>               nothing saved
 *   /support?sent=1                     saved and emailed
 *   /support?sent=mailto&t=<id>         saved; no RESEND_API_KEY, so the page offers a mailto:
 *   /support?sent=failed&t=<id>         saved; Resend refused or was unreachable, same mailto: offered
 */
export async function createTicket(form: FormData, deps: CreateDeps): Promise<string> {
  const parsed = parseTicketForm(form);
  if ("field" in parsed) return `/support?error=${parsed.field}`;

  let id: string;
  let clientSlug: string;
  try {
    // The workspace is never an argument: the database takes it from the caller's membership.
    const { data, error } = await deps.api.rpc("ticket_create", {
      p_subject: parsed.subject,
      p_body: parsed.body,
      p_severity: parsed.severity,
    });
    if (error) return `/support?error=${errorFlag(error)}`;
    const row: unknown = Array.isArray(data) ? data[0] : data;
    const got = row as { id?: unknown; client_slug?: unknown } | null;
    if (!got || typeof got.id !== "string" || !UUID.test(got.id) || typeof got.client_slug !== "string") return "/support?error=failed";
    id = got.id;
    clientSlug = got.client_slug;
  } catch {
    return "/support?error=failed";
  }

  const mail: TicketMail = { id, ...parsed, clientSlug, clientName: deps.clientName, requesterEmail: deps.requesterEmail };
  const { apiKey, fetchImpl, log = console.log } = deps;
  if (!apiKey) {
    log(`[connect] ticket saved, no RESEND_API_KEY: ${clientSlug}/${id}`);
    return `/support?sent=mailto&t=${id}`;
  }
  const sent = await sendMail(ticketEmail(mail), `ticket ${clientSlug}/${id}`, { apiKey, fetchImpl, log });
  return sent ? "/support?sent=1" : `/support?sent=failed&t=${id}`;
}
