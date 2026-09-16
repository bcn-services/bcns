/**
 * request-connection.ts — "Request connection" on an unconnected source.
 *
 * Self-serve OAuth is chunk 5. Until a source's app is approved the button
 * emails bcns and Nate runs the CLI path. RESEND_API_KEY is OPTIONAL by
 * design: with no key (every local run, every CI build) this degrades to a
 * console line plus a mailto link and still reports success to the caller.
 * There is no failure path — a missing key must never look like a broken hub.
 *
 * `fetch` is injected so tests can assert the exact Resend payload.
 */

/**
 * Mirrors `siteConfig.email` in apps/web/lib/site.ts. Copied, not imported:
 * apps/web must not depend on anything under apps/ (the marketing isolation
 * test in chunk 1), and the dependency would have to point that way.
 */
export const BCNS_EMAIL = "nseluga@bcn-services.com";

/** Resend rejects a `from` outside a verified domain; this one is the sending domain. */
export const REQUEST_FROM = "bcns Connect <connect@bcn-services.com>";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ConnectionRequest {
  clientName: string;
  clientSlug: string;
  source: string;
  requesterEmail: string | null;
}

export interface ResendEmail {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
}

export function buildEmail(request: ConnectionRequest): ResendEmail {
  const { clientName, clientSlug, source, requesterEmail } = request;
  return {
    from: REQUEST_FROM,
    to: [BCNS_EMAIL],
    ...(requesterEmail ? { reply_to: requesterEmail } : {}),
    subject: `Connection request: ${source} — ${clientName}`,
    text: [
      `Client: ${clientName} (${clientSlug})`,
      `Source: ${source}`,
      `Requested by: ${requesterEmail ?? "unknown"}`,
      "",
      `Run: pnpm --filter @bcn-services/platform exec tsx scripts/connect.ts --slug ${clientSlug} --source ${source}`,
    ].join("\n"),
  };
}

/** The same message as a mailto:, for the no-key path. */
export function mailtoLink(request: ConnectionRequest): string {
  const email = buildEmail(request);
  const query = new URLSearchParams({ subject: email.subject, body: email.text });
  return `mailto:${BCNS_EMAIL}?${query.toString()}`;
}

export interface RequestDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export type RequestOutcome =
  | { sent: true }
  /** Nothing was emailed; the page offers this link instead. */
  | { sent: false; mailto: string };

export async function requestConnection(
  request: ConnectionRequest,
  deps: RequestDeps = {}
): Promise<RequestOutcome> {
  const { apiKey, fetchImpl = fetch, log = console.log } = deps;
  const email = buildEmail(request);

  if (!apiKey) {
    log(`[connect] connection request (no RESEND_API_KEY): ${JSON.stringify(email)}`);
    return { sent: false, mailto: mailtoLink(request) };
  }

  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(email),
    });
    if (response.ok) return { sent: true };
    log(`[connect] resend rejected the request (${response.status}): ${JSON.stringify(email)}`);
  } catch (error) {
    log(`[connect] resend unreachable (${String(error)}): ${JSON.stringify(email)}`);
  }
  // A send that fails still has to leave the member a way through.
  return { sent: false, mailto: mailtoLink(request) };
}
