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

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { bearer, type Caller, type CallerMembership } from "./guard.ts";
import type { InviteDeps } from "../invite-member/handler.ts";
import type { MintDeps } from "../mint-agent-login/handler.ts";
import { randomPassword } from "../mint-agent-login/handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

function admin(): SupabaseClient {
  return createClient(URL_, SERVICE, NO_SESSION);
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
      // No getUserByEmail in the admin API; one filtered page is enough.
      const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      return found?.id ?? null;
    },
  };
}

export function mintDeps(request: Request): MintDeps {
  const base = guardDeps(request);
  const as = caller(request);
  return {
    ...base,
    randomPassword,
    async getClientSlug(_clientId: string) {
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
      const { data } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!existing) return { userId: null, error: created.error?.message };
      if (existing.app_metadata?.bcns_agent !== true) {
        // Rotation-hijack guard, same as the CLI: never re-password a human.
        return { userId: null, error: "not_an_agent_user" };
      }
      const updated = await a.auth.admin.updateUserById(existing.id, { password });
      return { userId: updated.error ? null : existing.id, error: updated.error?.message };
    },
    async insertMembership(userId: string, clientId: string, role: "member", _isSmoke: boolean) {
      await base.insertMembership(userId, clientId, role);
    },
  };
}
