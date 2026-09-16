/**
 * data.ts — shared-platform data access. Reads go through `api.*_v1` views
 * and writes through RPCs, both via @bcn-services/data-client, as the
 * signed-in user. The platform's RLS scopes every row to that user's client.
 *
 * Returns null when Supabase env is unset or when no one is signed in.
 * Callers render an empty/sign-in state for null.
 */

import { createDataClient, type DataClient } from "@bcn-services/data-client";
import { getConfig } from "./env";
import { createSupabaseServer } from "./supabase-server";

export async function getDataClient(): Promise<DataClient | null> {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const supabase = createSupabaseServer();
  // The token is only forwarded here; the platform verifies it on every read.
  // middleware.ts already validated it with getUser() for this request.
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!session) return null;
  return createDataClient({ supabaseUrl, anonKey: supabaseAnonKey, accessToken: session.access_token });
}
