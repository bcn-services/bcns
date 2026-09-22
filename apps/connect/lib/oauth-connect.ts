/**
 * oauth-connect.ts — the Next-facing halves the Meta and Monday flows share:
 * /start (POST), the bind-or-pick step at the end of /callback, and /pick.
 * The security decisions are pure functions in oauth-state.ts; this file wires
 * them to requests, cookies and the one api.connect_source write.
 *
 * W5b #1: a token that sees several ad accounts or boards is never bound to
 * "whichever came first". The provider's list for THIS token is sealed with the
 * token, the owner picks, and the pick is checked against that sealed list.
 * W5b #3: /start and /pick are POST-only and refuse a cross-site request.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getConfig, type HubConfig } from "./env";
import { ownerSession, type HubSession } from "./session";
import {
  PICK_TTL_MS,
  STATE_TTL_MS,
  chooseOption,
  isCrossSite,
  openPick,
  pickCookie,
  pickPath,
  sealPick,
  signState,
  type PendingPick,
  type PickSource,
} from "./oauth-state";
import { authorizeUrl as metaAuthorizeUrl, connectArgs as metaConnectArgs } from "./meta-oauth";
import { authorizeUrl as mondayAuthorizeUrl, connectArgs as mondayConnectArgs } from "./monday-oauth";
import { oauthEnabled, redirectUri } from "./oauth-config";

export const stateCookie = (source: PickSource) => `${source}_oauth_state`;
const statePath = (source: PickSource) => `/api/oauth/${source}`;

const NOUN: Record<PickSource, string> = { meta: "ad account", monday: "board" };
const TITLE: Record<PickSource, string> = { meta: "Meta", monday: "Monday" };

/** Non-null only after oauthEnabled(config, source) has passed. */
export function credentials(config: HubConfig, source: PickSource): { clientId: string; secret: string } {
  return source === "meta"
    ? { clientId: config.metaClientId!, secret: config.metaClientSecret! }
    : { clientId: config.mondayClientId!, secret: config.mondayClientSecret! };
}

/** Clear both hand-off cookies at the paths they were set on (a bare delete misses them). */
function clearCookies(response: NextResponse, source: PickSource): NextResponse {
  response.cookies.delete({ name: stateCookie(source), path: statePath(source) });
  response.cookies.delete({ name: pickCookie(source), path: pickPath(source) });
  return response;
}

/**
 * Every failure lands on the hub as `connect-failed`. 303 so a POST is not
 * replayed at the target. Coarse on purpose; the code goes to the server log,
 * never a token or a response body.
 */
export function failRedirect(hub: string, source: PickSource, where: string, code: string, detail?: string): NextResponse {
  console.warn(`[connect] ${source} ${where} rejected (${code})${detail ? `: ${detail}` : ""}`);
  return clearCookies(NextResponse.redirect(`${hub}/?error=connect-failed`, 303), source);
}

const forbidden = (hub: string) => NextResponse.redirect(`${hub}/?error=forbidden`, 303);

function write(session: HubSession, source: PickSource, pick: Omit<PendingPick, "exp">, id: string) {
  return session.api.rpc(
    "connect_source",
    source === "meta" ? metaConnectArgs(pick.accessToken, pick.expiresAt, id) : mondayConnectArgs(pick.accessToken, id)
  );
}

/* ---------------------------------------------------------------- /start */

export async function startPOST(request: Request, source: PickSource): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  // A third-party page must not be able to start (and so force) a reconnect.
  if (isCrossSite(request.headers, hub)) return failRedirect(hub, source, "start", "cross_site");
  if (!oauthEnabled(config, source)) return NextResponse.redirect(`${hub}/?error=oauth-unavailable`, 303);

  // Owner-only here, not just at the write: a member would consent and then be refused.
  const session = await ownerSession();
  if (!session) return forbidden(hub);

  const { clientId, secret } = credentials(config, source);
  const state = signState(session.membership.clientId, secret);
  const authorize = source === "meta" ? metaAuthorizeUrl : mondayAuthorizeUrl;
  const response = NextResponse.redirect(authorize(clientId, redirectUri(config, source), state), 303);
  response.cookies.set(stateCookie(source), state, {
    httpOnly: true,
    secure: hub.startsWith("https://"),
    sameSite: "lax",
    path: statePath(source),
    maxAge: STATE_TTL_MS / 1000,
  });
  return response;
}

/* ------------------------------------------------ end of /callback */

/**
 * One option: connect it, as before W5b. Several: seal the token and the list
 * for /pick. The caller has already refused zero options.
 */
export async function bindOrPick(
  source: PickSource,
  session: HubSession,
  config: HubConfig,
  handoff: Omit<PendingPick, "exp">
): Promise<NextResponse> {
  const hub = config.hubBaseUrl;
  if (handoff.options.length === 0) return failRedirect(hub, source, "callback", "no_options");

  if (handoff.options.length === 1) {
    const { error } = await write(session, source, handoff, handoff.options[0]!.id);
    // error.message can echo a parameter value, and one of them is the token.
    if (error) return failRedirect(hub, source, "callback", "write_failed", error.code ?? "rpc");
    return clearCookies(NextResponse.redirect(`${hub}/?connected=${source}`), source);
  }

  const response = NextResponse.redirect(`${hub}${pickPath(source)}`);
  response.cookies.delete({ name: stateCookie(source), path: statePath(source) });
  response.cookies.set(pickCookie(source), sealPick(handoff, credentials(config, source).secret, source), {
    httpOnly: true,
    secure: hub.startsWith("https://"),
    sameSite: "lax",
    path: pickPath(source),
    maxAge: PICK_TTL_MS / 1000,
  });
  return response;
}

/* ----------------------------------------------------------------- /pick */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function pickGET(request: NextRequest, source: PickSource): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  if (!oauthEnabled(config, source)) return failRedirect(hub, source, "pick", "unavailable");
  const opened = openPick(request.cookies.get(pickCookie(source))?.value, credentials(config, source).secret, source);
  if (!opened.ok) return failRedirect(hub, source, "pick", opened.reason);

  const session = await ownerSession();
  if (!session) return forbidden(hub);
  if (session.membership.clientId !== opened.pick.clientId) return failRedirect(hub, source, "pick", "tenant_mismatch");

  const noun = NOUN[source];
  const options = opened.pick.options
    .map(
      (o) =>
        `<label><input type="radio" name="id" value="${esc(o.id)}" required> ${esc(o.name)} <small>${esc(o.id)}</small></label>`
    )
    .join("");
  return new NextResponse(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Choose ${noun}</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;color:#2f3437;background:#fafaf9;max-width:34rem;margin:3rem auto;padding:0 16px}` +
      `label{display:block;padding:.5rem 0}small{color:#6b7075}button{margin-top:1rem;padding:.5rem 1rem}</style>` +
      `<h1>Which ${noun} should bcns connect?</h1>` +
      `<p>Your ${TITLE[source]} login can see more than one ${noun}. bcns syncs one. Choose it here.</p>` +
      `<form method="post" action="${pickPath(source)}">${options}<button type="submit">Connect</button></form>` +
      `<p><a href="/">Cancel</a></p></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      },
    }
  );
}

/**
 * Order: cross-site, gate, sealed list, the choice against that list, then the
 * owner and tenant, then the write. Nothing the browser sent is written: the id
 * comes back out of the sealed list.
 */
export async function pickPOST(request: NextRequest, source: PickSource): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  if (isCrossSite(request.headers, hub)) return failRedirect(hub, source, "pick", "cross_site");
  if (!oauthEnabled(config, source)) return failRedirect(hub, source, "pick", "unavailable");
  const opened = openPick(request.cookies.get(pickCookie(source))?.value, credentials(config, source).secret, source);
  if (!opened.ok) return failRedirect(hub, source, "pick", opened.reason);

  const form = await request.formData().catch(() => null);
  const id = chooseOption(opened.pick.options, form?.get("id"));
  if (!id) return failRedirect(hub, source, "pick", "not_offered");

  const session = await ownerSession();
  if (!session) return forbidden(hub);
  if (session.membership.clientId !== opened.pick.clientId) return failRedirect(hub, source, "pick", "tenant_mismatch");

  const { error } = await write(session, source, opened.pick, id);
  if (error) return failRedirect(hub, source, "pick", "write_failed", error.code ?? "rpc");
  return clearCookies(NextResponse.redirect(`${hub}/?connected=${source}`, 303), source);
}
