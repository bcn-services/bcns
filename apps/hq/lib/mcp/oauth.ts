// HQ's OAuth 2.1 authorization server for the MCP connector. Copied from apps/mcp/src/oauth.ts
// (node:http) and rewritten as (Request) => Promise<Response> handlers for Next route files.
//
// Difference that matters: apps/mcp hands the connector the plain Supabase session. HQ must not.
// A profiles user can UPDATE businesses.stage and call decide_proposal straight through PostgREST,
// so the Supabase JWT never leaves this process: /token returns random opaque tokens, and the
// real session is mapped server-side in public.mcp_tokens (migration 0031): keyed by the sha256 of
// the opaque token, with an expiry, so a deploy or restart no longer signs every connector out.
//
// Cookies are ignored on purpose: HQ's own session cookie reaches this host, and nothing here may
// read or reuse it.
import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { forget } from "./limit";

/** The public origin: issuer, resource and the only Origin a sign-in POST accepts. Never the request Host. */
export function publicOrigin(): string {
  const v = process.env.HQ_PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  return v || "https://hq.bcn-services.com";
}

export const CODE_TTL_MS = 60_000;
/** Bound on live codes. Sign-in is rate limited per IP, so this only fills under attack. */
export const MAX_CODES = 1000;
/** Bound on live opaque pairs (oldest evicted: that user reconnects). */
export const MAX_TOKEN_PAIRS = 1000;
/** Opaque refresh tokens live this long (the DB refuses more than 90 days). */
export const REFRESH_TTL_MS = 30 * 24 * 3600_000;
export const MAX_BODY_BYTES = 16 * 1024;
/** Failed or successful, every POST /authorize counts, per client IP (/64 for IPv6). */
export const LOGIN_LIMIT_PER_MIN = 10;
// Caps on calls going upstream to GoTrue (see apps/mcp/src/oauth.ts for the reasoning).
export const SIGNIN_GLOBAL_LIMIT_PER_MIN = 3;
export const REFRESH_GLOBAL_LIMIT_PER_MIN = 15;
export const SIGNIN_IP_LIMIT_PER_MIN = 2;
export const REFRESH_UNKNOWN_IP_LIMIT_PER_MIN = 3;
export const REFRESH_UNKNOWN_GLOBAL_LIMIT_PER_MIN = 5;
export const REFRESH_KNOWN_IP_LIMIT_PER_MIN = 10;
export const KNOWN_IP_TTL_MS = 60 * 60_000;
export const KNOWN_IP_MAX = 1000;
/** Sign-in and refresh each finish inside this; Claude's endpoint timeout is 10 s. */
export const UPSTREAM_TIMEOUT_MS = 8000;
export const RETRY_AFTER_SECONDS = 60;
export const RETRY_AFTER_BLIP_SECONDS = 1;
/** Opaque access tokens expire this many seconds before the Supabase JWT behind them. */
export const TOKEN_MARGIN_SECONDS = 30;

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** `status` is the auth server's HTTP status, or 0 when it could not be reached. */
export type SessionResult = { ok: true; session: Session } | { ok: false; status: number };

/** A signed-in user's `profiles` row. */
export interface Member {
  id: string;
  handle: "nate" | "brandon" | null;
}

export interface OAuthDeps {
  signIn(email: string, password: string): Promise<SessionResult>;
  refresh(refreshToken: string): Promise<SessionResult>;
  /** The profiles row for this Supabase access token (RLS: is_hq()), or null = not an HQ member. */
  member(accessToken: string): Promise<Member | null>;
  now(): number;
  randomBytes(size: number): Buffer;
  allowLogin(ip: string): boolean;
  allowSignInUpstream(): boolean;
  allowSignInIp(ip: string): boolean;
  allowRefreshUpstream(): boolean;
  allowKnownIpRefresh(ip: string): boolean;
  allowUnknownIpRefresh(ip: string): boolean;
  allowUnknownRefresh(): boolean;
  /** Where the opaque tokens live. Omitted = in this process's memory (tests). */
  tokens?: TokenStore;
}

// ---- Token store ----------------------------------------------------------------------------

/** One stored opaque token. `hash` is sha256 hex of the token; the token itself is never stored. */
export interface TokenRow {
  hash: string;
  kind: "access" | "refresh";
  userId: string;
  /** access: {jwt, handle, refresh_hash}. refresh: {sbRefresh, handle, access_hash}. */
  payload: Record<string, unknown>;
  expiresAt: number;
}

export interface TokenStore {
  /** Insert or re-point a row. `jwt` is that user's Supabase access token (the DB checks it is theirs). */
  put(jwt: string, row: TokenRow): Promise<void>;
  /** null = unknown or expired. Throws when the store is unreachable: an outage is not "invalid". */
  get(hash: string): Promise<TokenRow | null>;
  del(hash: string): Promise<void>;
  /** Every row of one user (HQ sign-out). */
  delUser(jwt: string, userId: string): Promise<void>;
}

export const tokenHash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** In-process store: the default for tests, bounded like the old Maps. */
export function memoryTokenStore(now: () => number = Date.now): TokenStore & {
  rows: Map<string, TokenRow>;
} {
  const rows = new Map<string, TokenRow>();
  return {
    rows,
    async put(_jwt, row) {
      forget(rows, row.hash);
      while (rows.size >= MAX_TOKEN_PAIRS * 2) forget(rows, rows.keys().next().value as string);
      rows.set(row.hash, row);
    },
    async get(hash) {
      const row = rows.get(hash);
      if (!row) return null;
      if (row.expiresAt <= now()) return (forget(rows, hash), null);
      return row;
    },
    async del(hash) {
      forget(rows, hash);
    },
    async delUser(_jwt, userId) {
      for (const [h, r] of rows) if (r.userId === userId) forget(rows, h);
    },
  };
}

/**
 * The public.mcp_token_* functions over PostgREST (plain fetch, hard timeout). store/revoke_user
 * carry the user's own JWT; lookup/revoke carry only the anon key, because the caller's only
 * credential is the token. No service-role key anywhere. `opts.fetch` is the test seam.
 */
export function supabaseTokenStore(
  env: SupabaseEnv,
  opts: { timeoutMs?: number; fetch?: typeof fetch } = {}
): TokenStore {
  const doFetch = opts.fetch ?? fetch;
  const base = `${env.url.replace(/\/+$/, "")}/rest/v1/rpc/`;
  async function rpc(fn: string, args: Record<string, unknown>, jwt?: string): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: env.anonKey,
    };
    // New-format keys are not JWTs and must never be sent as a Bearer token.
    const bearer = jwt ?? (/^sb_(publishable|secret)_/.test(env.anonKey) ? undefined : env.anonKey);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await doFetch(base + fn, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(opts.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`${fn}: ${res.status}`); // status only, never a body
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  return {
    async put(jwt, r) {
      await rpc(
        "mcp_token_store",
        {
          p_hash: r.hash,
          p_kind: r.kind,
          p_user_id: r.userId,
          p_payload: r.payload,
          p_expires_at: new Date(r.expiresAt).toISOString(),
        },
        jwt
      );
    },
    async get(hash) {
      const j = (await rpc("mcp_token_lookup", { p_hash: hash })) as {
        kind?: unknown;
        user_id?: unknown;
        payload?: unknown;
        expires_at?: unknown;
      } | null;
      if (!j) return null;
      const expiresAt = typeof j.expires_at === "string" ? Date.parse(j.expires_at) : NaN;
      if (
        (j.kind !== "access" && j.kind !== "refresh") ||
        typeof j.user_id !== "string" ||
        !j.payload ||
        typeof j.payload !== "object" ||
        Number.isNaN(expiresAt)
      )
        return null;
      return {
        hash,
        kind: j.kind,
        userId: j.user_id,
        payload: j.payload as Record<string, unknown>,
        expiresAt,
      };
    },
    async del(hash) {
      await rpc("mcp_token_revoke", { p_hash: hash });
    },
    async delUser(jwt, userId) {
      await rpc("mcp_token_revoke_user", { p_user_id: userId }, jwt);
    },
  };
}

// ---- Supabase-backed deps -------------------------------------------------------------------

/**
 * Plain fetch to GoTrue's token endpoint, not supabase-js: refreshSession retries with backoff far
 * past Claude's 10 s timeout. One attempt, hard timeout; a timeout or network error is status 0.
 * Anon key only. Nothing is stored here. `opts.fetch` is the test seam.
 */
export function supabaseSessionDeps(
  env: SupabaseEnv,
  opts: { timeoutMs?: number; fetch?: typeof fetch; log?: (line: string) => void } = {}
): Pick<OAuthDeps, "signIn" | "refresh"> {
  const timeoutMs = opts.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const doFetch = opts.fetch ?? fetch;
  const log = opts.log ?? ((line: string) => console.error(line));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: env.anonKey,
  };
  // New-format keys are not JWTs and must never be sent as a Bearer token.
  if (!/^sb_(publishable|secret)_/.test(env.anonKey))
    headers.Authorization = `Bearer ${env.anonKey}`;

  // Status only, never the body or a token.
  const fail = (event: string, status: number): SessionResult => {
    log(JSON.stringify({ level: "error", event, status }));
    return { ok: false, status };
  };

  async function grant(
    type: "password" | "refresh_token",
    body: Record<string, string>
  ): Promise<SessionResult> {
    const event = type === "password" ? "gotrue_signin_failed" : "gotrue_refresh_failed";
    try {
      const res = await doFetch(`${env.url.replace(/\/+$/, "")}/auth/v1/token?grant_type=${type}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        await res.body?.cancel();
        return fail(event, res.status);
      }
      const s = (await res.json()) as Partial<Session> | null;
      if (
        !s ||
        typeof s.access_token !== "string" ||
        typeof s.refresh_token !== "string" ||
        typeof s.expires_in !== "number"
      ) {
        return fail(event, 0);
      }
      return {
        ok: true,
        session: {
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_in: s.expires_in,
        },
      };
    } catch {
      return fail(event, 0); // timeout, DNS, refused, reset, bad JSON
    }
  }
  return {
    signIn: (email, password) => grant("password", { email, password }),
    refresh: (refreshToken) => grant("refresh_token", { refresh_token: refreshToken }),
  };
}

export function realRandomBytes(size: number): Buffer {
  return nodeRandomBytes(size);
}

// ---- Validation -----------------------------------------------------------------------------

const REDIRECT_EXACT = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);
const LOOPBACK_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}(\/[^#\s]*)?$/;

/** Exact match for the hosted connectors, any port for loopback (Claude Code), http only there. */
export function redirectAllowed(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 512) return false;
  if (REDIRECT_EXACT.has(uri)) return true;
  if (!LOOPBACK_RE.test(uri)) return false;
  try {
    const u = new URL(uri);
    return (
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      u.username === "" &&
      u.password === ""
    );
  } catch {
    return false; // port above 65535
  }
}

const CLIENT_ID_RE = /^[A-Za-z0-9_.~-]{1,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const MAX_STATE = 1024;

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string | null;
  challenge: string;
  resource: string | null;
}

/** Null on anything off-spec. Not redirected with an error: the caller shows a plain 400 page. */
function parseAuthorizeParams(q: URLSearchParams): AuthorizeParams | null {
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri");
  const challenge = q.get("code_challenge") ?? "";
  const state = q.get("state");
  const resource = q.get("resource");
  if (q.get("response_type") !== "code") return null;
  if (q.get("code_challenge_method") !== "S256") return null;
  if (!CLIENT_ID_RE.test(clientId)) return null;
  if (!redirectAllowed(redirectUri)) return null;
  if (!CHALLENGE_RE.test(challenge)) return null;
  if (state !== null && state.length > MAX_STATE) return null;
  if (resource !== null && resource !== "" && resource !== `${publicOrigin()}/mcp`) return null;
  return {
    clientId,
    redirectUri,
    state: state === null || state === "" ? null : state,
    challenge,
    resource: resource || null,
  };
}

// ---- HTML -----------------------------------------------------------------------------------

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Derived from the validated redirect, never from anything the client claims about itself. */
function appLabel(redirectUri: string): string {
  const host = new URL(redirectUri).hostname;
  if (host === "claude.ai") return "Claude (claude.ai)";
  if (host === "claude.com") return "Claude (claude.com)";
  return "An app on your computer";
}

function appNoun(redirectUri: string): string {
  const host = new URL(redirectUri).hostname;
  if (host === "claude.ai" || host === "claude.com") return "your Claude";
  return "an app on this computer";
}

/** Chromium also applies form-action to the redirect that follows the POST, so the allowlisted
 *  redirect origin has to be listed next to 'self' or the final hop to Claude is blocked. */
function pageHeaders(redirectUri?: string): Record<string, string> {
  const formAction = redirectUri ? `'self' ${new URL(redirectUri).origin}` : `'self'`;
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'`,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    // same-origin, not no-referrer: no-referrer makes the form POST carry `Origin: null`.
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
  };
}

const STYLE = `body{font:16px system-ui,sans-serif;max-width:24rem;margin:3rem auto;padding:0 1rem;color:#2b2f36;background:#fafafa}
label{display:block;margin:1rem 0 .25rem}input{width:100%;box-sizing:border-box;padding:.6rem;font:inherit}
button{margin-top:1.25rem;padding:.65rem 1.2rem;font:inherit;cursor:pointer}.err{color:#a4262c;margin:1rem 0 0}`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

function formHtml(p: AuthorizeParams, error?: string): string {
  const hidden = (name: string, value: string | null) =>
    value === null ? "" : `<input type="hidden" name="${name}" value="${esc(value)}">`;
  return page(
    "Sign in to bcns HQ",
    `<h1>Sign in to bcns HQ</h1>
<p>${esc(appLabel(p.redirectUri))} wants to read bcns HQ and make proposals as you. Approvals stay with you.</p>
<p>Only continue if you started connecting from ${esc(appNoun(p.redirectUri))} just now. If someone sent you this link, close this page.</p>
<form method="post" action="/authorize">
${hidden("response_type", "code")}${hidden("code_challenge_method", "S256")}${hidden("client_id", p.clientId)}${hidden("redirect_uri", p.redirectUri)}${hidden("state", p.state)}${hidden("code_challenge", p.challenge)}${hidden("resource", p.resource)}
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="320">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024">
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<button type="submit">Sign in and connect</button>
</form>`
  );
}

// ---- HTTP helpers ---------------------------------------------------------------------------

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function tokenError(error: string, status = 400): Response {
  return json(status, { error }, NO_STORE);
}

function htmlPage(status: number, html: string, redirectUri?: string): Response {
  return new Response(html, { status, headers: pageHeaders(redirectUri) });
}

const BAD_REQUEST_PAGE = page(
  "Cannot connect",
  "<h1>Cannot connect</h1><p>This connection request is not valid. Go back to the app and try again.</p>"
);

const tooLarge = () => json(413, { error: "payload_too_large" });

/** The body as text, or null when it exceeds `max` (the caller answers 413). Counts streamed bytes,
 *  so a chunked body with no Content-Length is capped too. */
export async function readBody(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function contentType(req: Request): string {
  return (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
}

/** Behind nginx (proxy_add_x_forwarded_for) the LAST hop is the address nginx itself saw; earlier
 *  hops are whatever the caller claimed. A Request has no socket, so without a proxy it is "unknown". */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

/** Limiter key for a client address: IPv4 whole, IPv4-mapped IPv6 as its IPv4, other IPv6 as its /64. */
export function ipKey(ip: string): string {
  const addr = ip.split("%")[0]!.toLowerCase();
  if (isIP(addr) !== 6) return addr;
  const mapped =
    addr.match(/^(?:0*:)*:ffff:(\d+\.\d+\.\d+\.\d+)$/) ??
    addr.match(/^(?:0*:)*:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    if (mapped[2] === undefined) return mapped[1]!;
    const hi = parseInt(mapped[1]!, 16);
    const lo = parseInt(mapped[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  const [head, tail = ""] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = addr.includes("::") && tail ? tail.split(":") : [];
  const groups = addr.includes("::")
    ? [...h, ...Array<string>(8 - h.length - t.length).fill("0"), ...t]
    : h;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

function sha256b64u(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** `sub` of a JWT GoTrue just issued to us. Decode only; never used to trust a client-supplied token. */
export function jwtSub(token: string): string | null {
  try {
    const c: unknown = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
    );
    const sub = (c as Record<string, unknown> | null)?.sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

// ---- State (globalThis) ---------------------------------------------------------------------

interface CodeRecord {
  session: Session;
  member: Member;
  challenge: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

export interface State {
  codes: Map<string, CodeRecord>;
  /** IPs that recently completed a good exchange; first key = least recent. */
  knownIps: Map<string, number>;
}

export const newState = (): State => ({
  codes: new Map(),
  knownIps: new Map(),
});

// ponytail: auth codes (60 s) and the known-IP set live in this process's memory (one standalone
// Next process); a restart only costs an in-flight sign-in. The tokens are in Postgres. Move the
// codes there too the day HQ runs more than one process.
export function oauthState(): State {
  const g = globalThis as { __hqOAuthState?: State };
  return (g.__hqOAuthState ??= newState());
}

// ---- Handlers -------------------------------------------------------------------------------

export function createOAuth(deps: OAuthDeps, state: State = oauthState()) {
  const { codes, knownIps } = state;
  const tokens = deps.tokens ?? memoryTokenStore(deps.now);

  function isKnown(ip: string): boolean {
    const at = knownIps.get(ip);
    if (at === undefined) return false;
    if (deps.now() - at < KNOWN_IP_TTL_MS) return true;
    forget(knownIps, ip);
    return false;
  }

  function markKnown(ip: string): void {
    forget(knownIps, ip);
    while (knownIps.size >= KNOWN_IP_MAX) forget(knownIps, knownIps.keys().next().value as string);
    knownIps.set(ip, deps.now());
  }

  function sweep(): void {
    // Constant TTL means insertion order is expiry order: stop at the first live entry.
    const now = deps.now();
    for (const [code, rec] of codes) {
      if (rec.expiresAt > now) break;
      forget(codes, code);
    }
  }

  /**
   * Mint a random opaque pair for a Supabase session and store its hashes. Returns the pair only,
   * or null when the store refused (nothing half-written is left usable).
   */
  async function issue(session: Session, member: Member) {
    const now = deps.now();
    const accessToken = deps.randomBytes(32).toString("base64url");
    const refreshToken = deps.randomBytes(32).toString("base64url");
    const ah = tokenHash(accessToken);
    const rh = tokenHash(refreshToken);
    const ttl = Math.max(1, session.expires_in - TOKEN_MARGIN_SECONDS);
    try {
      // refresh first: an access token whose refresh row is missing would strand the connector at expiry
      await tokens.put(session.access_token, {
        hash: rh,
        kind: "refresh",
        userId: member.id,
        payload: { sbRefresh: session.refresh_token, handle: member.handle, access_hash: ah },
        expiresAt: now + REFRESH_TTL_MS,
      });
      await tokens.put(session.access_token, {
        hash: ah,
        kind: "access",
        userId: member.id,
        payload: { jwt: session.access_token, handle: member.handle, refresh_hash: rh },
        expiresAt: now + ttl * 1000,
      });
    } catch {
      await tokens.del(rh).catch(() => {});
      return null;
    }
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ttl,
      refresh_token: refreshToken,
    };
  }

  /** Forget an opaque pair given its refresh row. */
  async function drop(refreshHash: string, rec: TokenRow): Promise<void> {
    const ah = rec.payload.access_hash;
    await Promise.all([
      tokens.del(refreshHash),
      typeof ah === "string" ? tokens.del(ah) : undefined,
    ]).catch(() => {}); // an unreachable store: the rows expire on their own
  }

  async function authorizeGet(req: Request): Promise<Response> {
    const params = parseAuthorizeParams(new URL(req.url).searchParams);
    if (!params) return htmlPage(400, BAD_REQUEST_PAGE);
    return htmlPage(200, formHtml(params), params.redirectUri);
  }

  async function authorizePost(req: Request): Promise<Response> {
    if (req.headers.get("origin") !== publicOrigin())
      return json(403, { error: "forbidden_origin" });
    if (contentType(req) !== "application/x-www-form-urlencoded")
      return htmlPage(400, BAD_REQUEST_PAGE);
    const raw = await readBody(req, MAX_BODY_BYTES);
    if (raw === null) return tooLarge();
    const form = new URLSearchParams(raw);
    const params = parseAuthorizeParams(form);
    if (!params) return htmlPage(400, BAD_REQUEST_PAGE);
    const show = (status: number, error: string) =>
      htmlPage(status, formHtml(params, error), params.redirectUri);

    const ip = ipKey(clientIp(req));
    if (!deps.allowLogin(ip)) return show(429, "Too many attempts. Wait a minute and try again.");

    const email = form.get("email") ?? "";
    const password = form.get("password") ?? "";
    if (!email || !password || email.length > 320 || password.length > 1024)
      return show(401, "Wrong email or password");

    if (!deps.allowSignInIp(ip) || !deps.allowSignInUpstream())
      return show(429, "Too many sign-in attempts. Try again in a minute.");
    const result = await deps.signIn(email, password);
    if (!result.ok) {
      if (result.status === 0 || result.status === 429 || result.status >= 500)
        return show(503, "Sign-in is unavailable. Try again shortly.");
      return show(401, "Wrong email or password");
    }
    // A Supabase auth user without a profiles row signs in fine but is not an HQ member.
    let member: Member | null = null;
    try {
      member = await deps.member(result.session.access_token);
    } catch {
      return show(503, "Sign-in is unavailable. Try again shortly.");
    }
    if (!member) return show(403, "No HQ membership");

    sweep();
    if (codes.size >= MAX_CODES) return show(503, "Sign-in is busy. Try again shortly.");
    const code = deps.randomBytes(32).toString("base64url");
    codes.set(code, {
      session: result.session,
      member,
      challenge: params.challenge,
      redirectUri: params.redirectUri,
      clientId: params.clientId,
      expiresAt: deps.now() + CODE_TTL_MS,
    });

    const location = new URL(params.redirectUri);
    location.searchParams.set("code", code);
    if (params.state) location.searchParams.set("state", params.state);
    location.searchParams.set("iss", publicOrigin());
    return new Response(null, {
      status: 302,
      headers: { Location: location.toString(), "Cache-Control": "no-store" },
    });
  }

  async function token(req: Request): Promise<Response> {
    if (contentType(req) !== "application/x-www-form-urlencoded")
      return tokenError("invalid_request");
    const raw = await readBody(req, MAX_BODY_BYTES);
    if (raw === null) return tooLarge();
    const form = new URLSearchParams(raw);
    const grant = form.get("grant_type");

    if (grant === "refresh_token") {
      const opaque = form.get("refresh_token");
      if (!opaque) return tokenError("invalid_request");
      // 503, never invalid_grant, for anything that is our or GoTrue's trouble rather than the
      // token's: the MCP SDK discards stored tokens on invalid_grant.
      const unavailable = (seconds = RETRY_AFTER_SECONDS) =>
        json(
          503,
          { error: "temporarily_unavailable" },
          { ...NO_STORE, "Retry-After": String(seconds) }
        );
      const ip = ipKey(clientIp(req));
      // All checks are synchronous and run before the first await, so concurrent requests are
      // counted request by request.
      const admitted = isKnown(ip)
        ? deps.allowKnownIpRefresh(ip)
        : deps.allowUnknownIpRefresh(ip) && deps.allowUnknownRefresh();
      if (!admitted) return unavailable();
      const rh = tokenHash(opaque);
      let rec: TokenRow | null;
      try {
        rec = await tokens.get(rh);
      } catch {
        return unavailable(RETRY_AFTER_BLIP_SECONDS);
      }
      const sbRefresh = rec?.kind === "refresh" ? rec.payload.sbRefresh : undefined;
      if (!rec || typeof sbRefresh !== "string") return tokenError("invalid_grant"); // unknown, expired or already rotated: no upstream call
      if (!deps.allowRefreshUpstream()) return unavailable();
      // GoTrue rotates its refresh token on use: if we cannot finish, point the stored row at the new
      // one so the connector's retry still works.
      const repoint = (newRefresh: string, jwt: string) =>
        tokens
          .put(jwt, { ...rec, payload: { ...rec.payload, sbRefresh: newRefresh } })
          .catch(() => {});
      const result = await deps.refresh(sbRefresh);
      if (!result.ok && result.status !== 400 && result.status !== 403) {
        return unavailable(result.status === 0 ? RETRY_AFTER_BLIP_SECONDS : RETRY_AFTER_SECONDS);
      }
      if (!result.ok) {
        await drop(rh, rec); // GoTrue says the underlying refresh token is dead
        return tokenError("invalid_grant");
      }
      // Membership can be revoked after sign-in: no profiles row now means no new pair.
      let member: Member | null;
      try {
        member = await deps.member(result.session.access_token);
      } catch {
        await repoint(result.session.refresh_token, result.session.access_token);
        return unavailable();
      }
      if (!member) {
        await drop(rh, rec);
        return tokenError("invalid_grant");
      }
      // New pair first, then the old one goes: a store failure keeps the old pair retryable.
      const pair = await issue(result.session, member);
      if (!pair) {
        await repoint(result.session.refresh_token, result.session.access_token);
        return unavailable();
      }
      // ponytail: the old pair is dropped at once. If this response is lost, the retry with the old
      // refresh token is invalid_grant (reconnect). Keep it 10 s (GoTrue's reuse window) if that bites.
      await drop(rh, rec);
      markKnown(ip);
      return json(200, pair, NO_STORE);
    }

    if (grant !== "authorization_code")
      return tokenError(grant ? "unsupported_grant_type" : "invalid_request");

    const code = form.get("code");
    const verifier = form.get("code_verifier");
    const redirectUri = form.get("redirect_uri");
    const clientId = form.get("client_id");
    if (!code || !verifier || !redirectUri || !clientId) return tokenError("invalid_request");

    // Single use: gone after the first attempt, whether or not it succeeds.
    const rec = codes.get(code);
    forget(codes, code);
    if (!rec || rec.expiresAt <= deps.now()) return tokenError("invalid_grant");
    if (rec.redirectUri !== redirectUri || rec.clientId !== clientId)
      return tokenError("invalid_grant");
    if (!VERIFIER_RE.test(verifier) || !safeEqual(sha256b64u(verifier), rec.challenge))
      return tokenError("invalid_grant");
    markKnown(ipKey(clientIp(req)));
    const pair = await issue(rec.session, rec.member);
    if (!pair)
      return json(
        503,
        { error: "temporarily_unavailable" },
        { ...NO_STORE, "Retry-After": String(RETRY_AFTER_BLIP_SECONDS) }
      );
    return json(200, pair, NO_STORE);
  }

  // Stateless DCR: validate the redirects, mint a random client_id, remember nothing.
  async function register(req: Request): Promise<Response> {
    const raw = await readBody(req, MAX_BODY_BYTES);
    if (raw === null) return tooLarge();
    let meta: unknown;
    try {
      meta = JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid_client_metadata" }, NO_STORE);
    }
    const uris = (meta as { redirect_uris?: unknown } | null)?.redirect_uris;
    if (
      !Array.isArray(uris) ||
      uris.length === 0 ||
      uris.length > 10 ||
      !uris.every(redirectAllowed)
    )
      return json(400, { error: "invalid_redirect_uri" }, NO_STORE);
    return json(
      201,
      {
        client_id: deps.randomBytes(16).toString("base64url"),
        client_id_issued_at: Math.floor(deps.now() / 1000),
        redirect_uris: uris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      NO_STORE
    );
  }

  function protectedResource(): Response {
    return json(200, {
      resource: `${publicOrigin()}/mcp`,
      authorization_servers: [publicOrigin()],
    });
  }

  function authorizationServer(): Response {
    const o = publicOrigin();
    return json(200, {
      issuer: o,
      authorization_endpoint: `${o}/authorize`,
      token_endpoint: `${o}/token`,
      registration_endpoint: `${o}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    });
  }

  /**
   * Opaque access token -> the Supabase JWT and member behind it, or null (unknown or expired).
   * Throws when the token store is unreachable: that is a 503, not a 401.
   */
  async function resolve(opaque: string): Promise<{ jwt: string; member: Member } | null> {
    const rec = await tokens.get(tokenHash(opaque));
    if (!rec || rec.kind !== "access" || rec.expiresAt <= deps.now()) return null;
    const { jwt, handle } = rec.payload;
    if (typeof jwt !== "string") return null;
    return {
      jwt,
      member: { id: rec.userId, handle: handle === "nate" || handle === "brandon" ? handle : null },
    };
  }

  return {
    authorizeGet,
    authorizePost,
    token,
    register,
    protectedResource,
    authorizationServer,
    resolve,
    markKnown,
  };
}

export type OAuth = ReturnType<typeof createOAuth>;
