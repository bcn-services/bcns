/**
 * google-connect.ts — the Next-facing halves of the Meet and Drive flows:
 * /start (POST), /callback (GET) and /pick (GET renders the Google Picker, POST connects).
 * The routes are thin wrappers; the security decisions are pure functions in google-oauth.ts and
 * oauth-state.ts. Session and fetch are injected so tests drive every branch without Next or Google.
 *
 * Same order of checks as QuickBooks and Meta/Monday: cross-site, gate, signed state FIRST, state
 * cookie, owner session and tenant, then the network. The callback seals the tokens (it never
 * writes): the owner must pick a folder first, and the pick is verified server-side with their own
 * token before api.connect_source runs.
 */

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfig, type HubConfig } from "./env";
import { ownerSession, type HubSession } from "./session";
import { isCrossSite, safeEqual, signState, verifyState, PICK_TTL_MS, STATE_TTL_MS } from "./oauth-state";
import { oauthEnabled, redirectUri } from "./oauth-config";
import { FOLDER_ID } from "./source-settings";
import {
  authorizeUrl,
  connectArgs,
  exchangeCode,
  googlePickCookie,
  googlePickPath,
  googleStateCookie,
  googleStatePath,
  openGoogle,
  sealGoogle,
  stateSecret,
  verifyFolder,
  FOLDER_MIME,
  type GoogleSource,
} from "./google-oauth";

export interface GoogleDeps {
  session: () => Promise<HubSession | null>;
  fetchImpl: typeof fetch;
}
const defaultDeps: GoogleDeps = { session: ownerSession, fetchImpl: (...a) => fetch(...a) };

/** Non-null only after oauthEnabled(config, source) has passed. */
const creds = (config: HubConfig) => ({ clientId: config.googleClientId!, secret: config.googleClientSecret! });

const cookieOpts = (hub: string, path: string, maxAgeMs: number) => ({
  httpOnly: true,
  secure: hub.startsWith("https://"),
  sameSite: "lax" as const,
  path,
  maxAge: maxAgeMs / 1000,
});

/** Clear both hand-off cookies at the paths they were set on (a bare delete misses them). */
function clearCookies(response: NextResponse, source: GoogleSource): NextResponse {
  response.cookies.delete({ name: googleStateCookie(source), path: googleStatePath(source) });
  response.cookies.delete({ name: googlePickCookie(source), path: googlePickPath(source) });
  return response;
}

/** Every failure lands on the hub as `connect-failed`; the code goes to the log, never a token or body. */
function fail(hub: string, source: GoogleSource, where: string, code: string, detail?: string): NextResponse {
  console.warn(`[connect] ${source} ${where} rejected (${code})${detail ? `: ${detail}` : ""}`);
  return clearCookies(NextResponse.redirect(`${hub}/?error=connect-failed`, 303), source);
}
const forbidden = (hub: string, source: GoogleSource) =>
  clearCookies(NextResponse.redirect(`${hub}/?error=forbidden`, 303), source);

/* ---------------------------------------------------------------- /start */

export async function startPOST(request: Request, source: GoogleSource, deps: GoogleDeps = defaultDeps): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  // A third-party page must not be able to start (and so force) a reconnect.
  if (isCrossSite(request.headers, hub)) return fail(hub, source, "start", "cross_site");
  if (!oauthEnabled(config, source)) return NextResponse.redirect(`${hub}/?error=oauth-unavailable`, 303);

  // Owner-only here, not just at the write: a member would consent and then be refused.
  const session = await deps.session();
  if (!session) return NextResponse.redirect(`${hub}/?error=forbidden`, 303);

  const { clientId, secret } = creds(config);
  const state = signState(session.membership.clientId, stateSecret(secret, source));
  const response = NextResponse.redirect(authorizeUrl(clientId, redirectUri(config, source), state), 303);
  response.cookies.set(googleStateCookie(source), state, cookieOpts(hub, googleStatePath(source), STATE_TTL_MS));
  return response;
}

/* ------------------------------------------------------------- /callback */

export async function callbackGET(request: NextRequest, source: GoogleSource, deps: GoogleDeps = defaultDeps): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  if (!oauthEnabled(config, source)) return fail(hub, source, "callback", "unavailable");
  const { clientId, secret } = creds(config);
  const params = request.nextUrl.searchParams;

  // State first: Google sends no HMAC, so this signature is the only CSRF defense.
  const state = verifyState(params.get("state"), stateSecret(secret, source));
  if (!state.ok) return fail(hub, source, "callback", `state_${state.reason}`);
  const cookie = request.cookies.get(googleStateCookie(source))?.value;
  if (!cookie || !safeEqual(cookie, String(params.get("state")))) return fail(hub, source, "callback", "state_cookie");

  // The owner pressed Cancel / Deny on Google's consent screen (error=access_denied): a clean failure.
  if (params.get("error")) return fail(hub, source, "callback", "consent_denied", params.get("error")!.slice(0, 40));

  const session = await deps.session();
  if (!session) return forbidden(hub, source);
  if (session.membership.clientId !== state.payload.clientId) return fail(hub, source, "callback", "tenant_mismatch");

  const code = params.get("code");
  if (!code) return fail(hub, source, "callback", "no_code");

  // A timeout or DNS failure is a connect-failed with the cookie cleared, not a 500.
  const token = await exchangeCode(clientId, secret, redirectUri(config, source), code, deps.fetchImpl).catch(
    () => ({ ok: false as const, reason: "http_error" as const, detail: "network" })
  );
  if (!token.ok) return fail(hub, source, "callback", `exchange_${token.reason}`, token.detail);

  const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
  const sealed = sealGoogle(
    { clientId: state.payload.clientId, accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt },
    secret,
    source
  );
  const response = NextResponse.redirect(`${hub}${googlePickPath(source)}`, 303);
  response.cookies.delete({ name: googleStateCookie(source), path: googleStatePath(source) });
  response.cookies.set(googlePickCookie(source), sealed, cookieOpts(hub, googlePickPath(source), PICK_TTL_MS));
  return response;
}

/* ----------------------------------------------------------------- /pick */

/**
 * CSP origins the Picker needs. NOTE: ~/bcns-w-google/.claude/fable/research-google-scope.md was not
 * present when this was written, so these are the three named in the C1 brief and have not been
 * checked in a real browser. If the Picker renders blank, the console CSP violation names the missing
 * origin (likely www.gstatic.com for script/style, content.googleapis.com for frames); add it here only.
 */
export const PICKER_SCRIPT_ORIGINS = ["https://apis.google.com", "https://www.googleapis.com"] as const;
export const PICKER_FRAME_ORIGINS = ["https://docs.google.com"] as const;
export const PICKER_CONNECT_ORIGINS = ["https://apis.google.com", "https://www.googleapis.com"] as const;

export function pickCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${PICKER_SCRIPT_ORIGINS.join(" ")}`,
    `frame-src ${PICKER_FRAME_ORIGINS.join(" ")}`,
    `connect-src ${PICKER_CONNECT_ORIGINS.join(" ")}`,
    "style-src 'unsafe-inline'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** JSON for an inline <script>: `<` escaped so no value can close the tag. */
const inlineJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export async function pickGET(request: NextRequest, source: GoogleSource, deps: GoogleDeps = defaultDeps): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  // Cancel drops the sealed tokens now instead of leaving them for PICK_TTL_MS.
  if (request.nextUrl.searchParams.has("cancel")) return clearCookies(NextResponse.redirect(`${hub}/`, 303), source);
  if (!oauthEnabled(config, source)) return fail(hub, source, "pick", "unavailable");
  const opened = openGoogle(request.cookies.get(googlePickCookie(source))?.value, creds(config).secret, source);
  if (!opened.ok) return fail(hub, source, "pick", opened.reason);

  const session = await deps.session();
  if (!session) return forbidden(hub, source);
  if (session.membership.clientId !== opened.pending.clientId) return fail(hub, source, "pick", "tenant_mismatch");

  const nonce = randomBytes(16).toString("base64");
  const path = googlePickPath(source);
  // The access token reaches the owner's own browser: the Picker cannot open without it (setOAuthToken).
  // It is the token of the owner who just consented, shown only to them, on a no-store page under a strict CSP.
  const cfg = inlineJson({
    token: opened.pending.accessToken,
    key: config.googlePickerApiKey,
    appId: config.googleCloudProjectNumber,
    folder: FOLDER_MIME,
  });
  return new NextResponse(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Choose a folder</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;color:#2f3437;background:#fafaf9;max-width:34rem;margin:3rem auto;padding:0 16px}` +
      `button{margin-top:1rem;padding:.5rem 1rem}</style>` +
      `<h1>Which Google Drive folder should bcns read?</h1>` +
      `<p>Pick one folder. bcns syncs that folder and the files inside it, and nothing else in your Drive.</p>` +
      `<form id="f" method="post" action="${path}"><input type="hidden" name="id" id="id">` +
      `<button type="button" id="open">Choose folder</button></form>` +
      `<p><a href="${path}?cancel=1">Cancel</a></p>` +
      `<script nonce="${nonce}" src="https://apis.google.com/js/api.js"></script>` +
      `<script nonce="${nonce}">(function(){var c=${cfg};` +
      `function go(){var v=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(c.folder);` +
      `new google.picker.PickerBuilder().addView(v).setOAuthToken(c.token).setDeveloperKey(c.key).setAppId(c.appId)` +
      `.setCallback(function(d){if(d.action===google.picker.Action.PICKED&&d.docs&&d.docs[0]){document.getElementById("id").value=d.docs[0].id;document.getElementById("f").submit();}})` +
      `.build().setVisible(true);}` +
      `function load(){gapi.load("picker",{callback:go});}` +
      `document.getElementById("open").addEventListener("click",load);load();})();</script></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        // strict-origin, NOT no-referrer: under no-referrer the Picker callback's form.submit() (a non-CORS POST) carries
        // `Origin: null`, and isCrossSite refuses that even with Sec-Fetch-Site: same-origin, so every real pick would fail.
        // strict-origin keeps Origin on the same-origin POST and sends only the hub origin as Referer to Google, which an
        // HTTP-referrer-restricted Picker API key needs.
        "Referrer-Policy": "strict-origin",
        "Content-Security-Policy": pickCsp(nonce),
      },
    }
  );
}

/**
 * Order: cross-site, gate, sealed tokens, the folder id's shape, owner and tenant, a server-side
 * check that Drive agrees the id is a folder this token can see, then the one write.
 */
export async function pickPOST(request: NextRequest, source: GoogleSource, deps: GoogleDeps = defaultDeps): Promise<NextResponse> {
  const config = getConfig();
  const hub = config.hubBaseUrl;
  if (isCrossSite(request.headers, hub)) return fail(hub, source, "pick", "cross_site");
  if (!oauthEnabled(config, source)) return fail(hub, source, "pick", "unavailable");
  const { clientId, secret } = creds(config);
  const opened = openGoogle(request.cookies.get(googlePickCookie(source))?.value, secret, source);
  if (!opened.ok) return fail(hub, source, "pick", opened.reason);

  const form = await request.formData().catch(() => null);
  const id = form?.get("id");
  if (typeof id !== "string" || !FOLDER_ID.test(id)) return fail(hub, source, "pick", "bad_folder_id");

  const session = await deps.session();
  if (!session) return forbidden(hub, source);
  if (session.membership.clientId !== opened.pending.clientId) return fail(hub, source, "pick", "tenant_mismatch");

  // Never write an id the token cannot see, or one that is a file rather than a folder.
  const folder = await verifyFolder(opened.pending.accessToken, id, deps.fetchImpl).catch(
    () => ({ ok: false as const, reason: "http_error" as const, detail: "network" })
  );
  if (!folder.ok) return fail(hub, source, "pick", `folder_${folder.reason}`, folder.detail);

  const { accessToken, refreshToken, expiresAt } = opened.pending;
  const { error } = await session.api.rpc("connect_source", connectArgs(source, accessToken, refreshToken, expiresAt, id, clientId));
  // error.message can echo a parameter value, and one of them is the token.
  if (error) return fail(hub, source, "pick", "write_failed", error.code ?? "rpc");
  return clearCookies(NextResponse.redirect(`${hub}/?connected=${source}`, 303), source);
}
