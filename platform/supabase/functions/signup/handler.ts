/**
 * signup — owner self-service sign-up (P1). Public: no caller JWT exists yet, so the
 * function is deployed with --no-verify-jwt and every limit lives here and in the database.
 *
 *   1. create the auth user (admin API, unconfirmed, NO password — hosted public sign-ups stay OFF).
 *      Taking no password is the pre-hijack fix: whoever proves inbox ownership by clicking the
 *      confirmation link sets the password on the hub's /set-password. A `password` in the body is
 *      ignored, not rejected, so a stale client still gets the same 200;
 *   2. api.signup_create_client: the pending client + owner membership, one transaction,
 *      capped per rolling hour (BCNS8);
 *   3. ask GoTrue to send its own confirmation email, which lands on the hub's /auth/confirm.
 *
 * Step 2 failing deletes the user from step 1, so no orphan auth user is left behind. Mail is
 * only sent after step 2 succeeds, so the database cap bounds mail too.
 *
 * Dark by default: unless the function secret SIGNUP_ENABLED is `1`, every request answers 404
 * before anything else runs (the hub's SIGNUP_ENABLED only shows the page; this is the real switch).
 *
 * No email enumeration: an address that already has an account, a capped window and a fresh
 * sign-up all answer the same 200 ACCEPTED body. Only malformed input (independent of whether
 * the address exists) and a server fault on a NEW address answer differently.
 */

import { json } from "../_shared/guard.ts";

/** Where the confirmation email's link lands: the hub's token-verifying route (type=email). */
export const SIGNUP_REDIRECT = "https://connect.bcn-services.com/auth/confirm";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

/** Same loose shape as invite-member: GoTrue is the real validator. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Budget key for an address: IPv4 as is, IPv4-mapped IPv6 as its IPv4, other IPv6 as its /64 (a host rotates inside its /64). */
export function ipKey(ip: string): string {
  const addr = ip.split("%")[0].toLowerCase();
  if (!addr.includes(":")) return addr;
  const mapped = addr.match(/^(?:0*:)*:ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? addr.match(/^(?:0*:)*:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    if (mapped[2] === undefined) return mapped[1];
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  const [head, tail = ""] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = addr.includes("::") && tail ? tail.split(":") : [];
  const groups = addr.includes("::") ? [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export const ACCEPTED = { ok: true } as const;

export interface SignupDeps {
  /** Function secret SIGNUP_ENABLED === "1". False = 404, nothing called. */
  enabled: boolean;
  /** userId null = not created (most often: the address already has an account). */
  createUser(email: string): Promise<{ userId: string | null; error?: string }>;
  /** api.signup_create_client. Throws with `code` set to the SQLSTATE on failure. */
  createClient(userId: string, name: string): Promise<string>;
  deleteUser(userId: string): Promise<void>;
  sendConfirmation(email: string, redirectTo: string): Promise<{ error?: string }>;
  /** Pay-first sign-up's lookup (`{mode:"exists"}`): does this address already have an auth user? Absent = 503. */
  userExists?(email: string): Promise<boolean>;
  /** api.take_rate_budget: true = within budget (and counted). Absent or throws = 503, fail closed. */
  takeBudget?(bucket: string, key: string, limit: number, windowSec: number): Promise<boolean>;
  /** The hub's egress IP: it asks on behalf of every visitor, so it gets the larger exists budget. */
  hubIp?: string;
  /** Event + ids only — never the email or the request body. */
  log(event: string, data: Record<string, unknown>): void;
}

export async function handle(request: Request, deps: SignupDeps): Promise<Response> {
  if (!deps.enabled) return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  // Pay-first mode: the hub asks before it opens a Stripe Checkout (the hub holds no service-role key).
  // Creates nothing and mails nothing. It does reveal whether an address is registered, on purpose: the
  // hub tells that visitor to sign in instead of paying. Still behind the SIGNUP_ENABLED gate above.
  if (body?.mode === "exists") {
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) return json({ error: "invalid_email" }, 400);
    if (!deps.userExists || !deps.takeBudget) return json({ error: "unavailable" }, 503);
    // Per-IP budget on the presence check: it is a public email oracle. Refused is 429, never a
    // false {exists:false}, which would send an existing owner to Stripe to pay twice.
    const cf = request.headers.get("cf-connecting-ip");
    if (!cf) deps.log("signup_budget_no_ip", {});
    const ip = cf ?? "unknown";
    let key = ipKey(ip);
    let limit = 10;
    if (ip === deps.hubIp) {
      // The hub asks for every visitor from one IP. It forwards the visitor's own address, trusted
      // ONLY on a call from the hub's IP (a direct caller cannot originate from the droplet).
      // An older hub sends none: its shared bucket gets the larger allowance.
      const visitor = request.headers.get("x-bcns-visitor-ip")?.trim() ?? "";
      if (visitor && visitor.length <= 64 && /^[0-9a-fA-F:.]+$/.test(visitor)) key = `hub:${ipKey(visitor)}`;
      else limit = 60;
    }
    try {
      if (!(await deps.takeBudget("signup_exists", key, limit, 3600))) {
        return json({ error: "rate_limited" }, 429);
      }
    } catch {
      deps.log("signup_budget_failed", {});
      return json({ error: "unavailable" }, 503);
    }
    try {
      return json({ exists: await deps.userExists(email) }, 200);
    } catch {
      deps.log("signup_lookup_failed", {});
      return json({ error: "lookup_failed" }, 502);
    }
  }
  if (!name || name.length > MAX_NAME_LENGTH) return json({ error: "invalid_name" }, 400);
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) return json({ error: "invalid_email" }, 400);

  const created = await deps.createUser(email);
  if (!created.userId) {
    // Every createUser refusal answers the same 200. Never map a GoTrue validation
    // error to 400: it checks for a duplicate email first, so that would leak existence.
    deps.log("signup_not_created", { reason: created.error ?? "unknown" });
    if (created.error === "email_exists") {
      // Re-send the confirmation: GoTrue /resend is a no-op for confirmed or unknown users and has its
      // own per-user rate limit, so a lost mail is recoverable without creating anything.
      try {
        const sent = await deps.sendConfirmation(email, SIGNUP_REDIRECT);
        if (sent.error) deps.log("signup_resend_failed", {});
      } catch {
        deps.log("signup_resend_failed", {});
      }
    }
    return json(ACCEPTED, 200);
  }

  let slug: string;
  try {
    slug = await deps.createClient(created.userId, name);
  } catch (error) {
    const code = (error as { code?: string }).code;
    try {
      await deps.deleteUser(created.userId);
    } catch {
      deps.log("signup_orphan_user", { userId: created.userId });
    }
    deps.log("signup_client_failed", { userId: created.userId, code: code ?? "unknown" });
    // The cap answers like success so it cannot be told apart from an existing address.
    return code === "BCNS8" ? json(ACCEPTED, 200) : json({ error: "signup_failed" }, 502);
  }

  const sent = await deps.sendConfirmation(email, SIGNUP_REDIRECT);
  if (sent.error) deps.log("signup_mail_failed", { userId: created.userId, slug });
  deps.log("signup_created", { userId: created.userId, slug });
  return json(ACCEPTED, 200);
}
