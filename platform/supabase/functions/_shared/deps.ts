/**
 * deps.ts — the Deno half: the only file in this tree that touches Deno.env,
 * the network, or the service-role key. Never imported by a test, which is why
 * the handlers take their deps instead of reaching for a client.
 *
 * Two clients, on purpose:
 *  - ADMIN (service role) is used for the Auth admin API ONLY — creating,
 *    inviting and re-passwording users. That is the one thing an anon key
 *    cannot do, and the whole reason these functions exist instead of a server
 *    action on the droplet.
 *  - CALLER (anon key + the caller's own JWT) does every database read and
 *    write, so RLS and api.add_member's owner check apply to the real user. The
 *    service role has no usage on the `api` or `data` schemas and PostgREST
 *    exposes only `api`; keeping it that way is the point.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.116";
import { bearer, type Caller, type CallerMembership } from "./guard.ts";
import type { InviteDeps } from "../invite-member/handler.ts";
import type { MintDeps } from "../mint-agent-login/handler.ts";
import { randomPassword } from "../mint-agent-login/handler.ts";
import type { ShopRedactDeps } from "../shopify-shop-redact/handler.ts";
import type { SignupDeps } from "../signup/handler.ts";
import type { StripeWebhookDeps } from "../stripe-webhook/handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

function admin(): SupabaseClient {
  return createClient(URL_, SERVICE, NO_SESSION);
}

interface AdminUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}

/**
 * Exact-email lookup through the GoTrue admin API. supabase-js has no
 * getUserByEmail and listUsers pages newest-first, so one page misses older
 * users; `filter` is GoTrue's server-side ILIKE on email/phone, narrowed to an
 * exact match here.
 */
async function findUser(email: string): Promise<AdminUser | null> {
  const wanted = email.toLowerCase();
  const url = `${URL_.replace(/\/+$/, "")}/auth/v1/admin/users?filter=${encodeURIComponent(wanted)}&per_page=50`;
  const response = await fetch(url, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`admin user lookup failed: ${response.status}`);
  const body = (await response.json()) as { users?: AdminUser[] };
  return body.users?.find((u) => u.email?.toLowerCase() === wanted) ?? null;
}

function caller(request: Request): SupabaseClient {
  const token = bearer(request) ?? "";
  return createClient(URL_, ANON, {
    ...NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Shared by both functions: verify the caller, then read their own membership. */
function guardDeps(request: Request) {
  const as = caller(request);
  return {
    async getUser(accessToken: string): Promise<Caller | null> {
      const { data } = await createClient(URL_, ANON, NO_SESSION).auth.getUser(accessToken);
      return data.user ? { userId: data.user.id, email: data.user.email ?? null } : null;
    },
    async getMembership(userId: string): Promise<CallerMembership | null> {
      const { data } = await as
        .schema("api")
        .from("memberships_v1")
        .select("client_id,role")
        .eq("user_id", userId)
        .maybeSingle();
      return data ? { clientId: data.client_id as string, role: data.role as string } : null;
    },
    /**
     * api.add_member takes the tenant from the caller's JWT, so the clientId
     * the handler passes is belt to the database's braces — both say the
     * caller's own client, and neither can be steered by the request body.
     */
    async insertMembership(_userId: string, _clientId: string, role: "member"): Promise<void> {
      const { error } = await as
        .schema("api")
        .rpc("add_member", { target_user_id: _userId, member_role: role });
      if (error) throw new Error(`add_member: ${error.message}`);
    },
  };
}

export function inviteDeps(request: Request): InviteDeps {
  const base = guardDeps(request);
  return {
    ...base,
    async inviteUser(email: string, redirectTo: string) {
      const { data, error } = await admin().auth.admin.inviteUserByEmail(email, { redirectTo });
      return { userId: data?.user?.id ?? null, error: error?.message };
    },
    async findUserByEmail(email: string) {
      return (await findUser(email))?.id ?? null;
    },
  };
}

export function mintDeps(request: Request): MintDeps {
  const base = guardDeps(request);
  const as = caller(request);
  return {
    ...base,
    randomPassword,
    async getClientSlug() {
      const { data } = await as.schema("api").from("client_v1").select("slug").maybeSingle();
      return (data?.slug as string | undefined) ?? null;
    },
    async upsertUser(email: string, password: string) {
      const a = admin();
      const created = await a.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { bcns_agent: true },
      });
      if (created.data?.user) return { userId: created.data.user.id };
      // Already exists: rotate, exactly like `add-member.ts --agent` re-run.
      const existing = await findUser(email);
      if (!existing) return { userId: null, error: created.error?.message };
      if (existing.app_metadata?.bcns_agent !== true) {
        // Rotation-hijack guard, same as the CLI: never re-password a human.
        return { userId: null, error: "not_an_agent_user" };
      }
      const updated = await a.auth.admin.updateUserById(existing.id, { password });
      return { userId: updated.error ? null : existing.id, error: updated.error?.message };
    },
    async insertMembership(userId: string, clientId: string, role: "member") {
      await base.insertMembership(userId, clientId, role);
    },
  };
}

/**
 * shopify-shop-redact has no caller JWT (HMAC is the only auth), so unlike guardDeps' `as` client
 * this calls the RPC as the SERVICE ROLE — the one new grant that requires (migration
 * 20260924000300: `usage on schema api` + `execute on api.record_shop_redact` to service_role
 * only; still zero access to any `data` table, which is the wall this file's own comment
 * describes). The RPC itself is the narrow SECURITY DEFINER surface, not this client.
 * api.record_app_uninstalled (20260929000200) is the second such grant; api.signup_create_client
 * (20261001000200, signupDeps below) is the third.
 */
export function shopRedactDeps(): ShopRedactDeps {
  return {
    async recordShopRedact(shop, webhookId) {
      const { data, error } = await admin().schema("api").rpc("record_shop_redact", {
        p_shop: shop,
        p_webhook_id: webhookId,
      });
      if (error) throw new Error(`record_shop_redact: ${error.message}`);
      return { inserted: data === true };
    },
    async recordAppUninstalled(shop, triggeredAt) {
      const { data, error } = await admin().schema("api").rpc("record_app_uninstalled", {
        p_shop: shop,
        p_triggered_at: triggeredAt,
      });
      if (error) throw new Error(`record_app_uninstalled: ${error.message}`);
      return { revoked: typeof data === "number" ? data : 0 };
    },
    // Shop + webhook id + outcome only — never the payload, the HMAC header, or the secret.
    log(event, data) {
      console.log(JSON.stringify({ event, ...data }));
    },
  };
}

/**
 * signup (P1) has no caller JWT either. The admin API creates and (on a failed second step)
 * deletes the user; api.signup_create_client is called as the service role, the third grant
 * described above. The confirmation email goes through GoTrue's own mailer via the PUBLIC
 * resend endpoint with the anon key — the same call any visitor can already make — so this
 * file holds no mail credential and GoTrue's email rate limit applies on top of the DB cap.
 */
export function signupDeps(): SignupDeps {
  return {
    enabled: Deno.env.get("SIGNUP_ENABLED") === "1",
    async createUser(email) {
      // No password: the inbox owner sets it on /set-password after confirming (pre-hijack fix).
      const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: false });
      return { userId: data?.user?.id ?? null, error: error?.code ?? error?.message };
    },
    async createClient(userId, name) {
      const { data, error } = await admin().schema("api").rpc("signup_create_client", {
        p_user_id: userId,
        p_name: name,
      });
      if (error) throw Object.assign(new Error(`signup_create_client: ${error.message}`), { code: error.code });
      return data as string;
    },
    async deleteUser(userId) {
      const { error } = await admin().auth.admin.deleteUser(userId);
      if (error) throw new Error(`deleteUser: ${error.message}`);
    },
    async sendConfirmation(email, redirectTo) {
      const { error } = await createClient(URL_, ANON, NO_SESSION).auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirectTo },
      });
      return { error: error?.message };
    },
    log(event, data) {
      console.log(JSON.stringify({ event, ...data }));
    },
  };
}

/**
 * stripe-webhook (item 1) has no caller JWT either: the Stripe signature is its auth. Two more
 * service-role grants, both narrow SECURITY DEFINER RPCs (20261007000100): one client's billing
 * state, and the guarded apply. Still no privilege on any data.* table.
 */
export function stripeWebhookDeps(): StripeWebhookDeps {
  const iso = (sec: number | null) => (sec === null ? null : new Date(sec * 1000).toISOString());
  return {
    now: () => Math.floor(Date.now() / 1000),
    async readState(clientId, customerId) {
      const { data, error } = await admin().schema("api").rpc("stripe_billing_state", {
        p_client: clientId,
        p_customer: customerId,
      });
      if (error) throw new Error(`stripe_billing_state: ${error.message}`);
      return data;
    },
    async apply(i) {
      const { data, error } = await admin().schema("api").rpc("stripe_apply_billing", {
        p_event_id: i.eventId,
        p_event_type: i.eventType,
        p_event_created: iso(i.eventCreated),
        p_client: i.clientId,
        p_action: i.action,
        p_customer: i.customerId,
        p_subscription: i.subscriptionId,
        p_grace_until: iso(i.graceUntil),
      });
      if (error) throw new Error(`stripe_apply_billing: ${error.message}`);
      if (data !== "applied" && data !== "duplicate" && data !== "conflict") throw new Error("stripe_apply_billing: bad result");
      return data;
    },
    log(event, data) {
      console.log(JSON.stringify({ event, ...data }));
    },
  };
}
