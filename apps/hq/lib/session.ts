import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "./supabase";

export interface Profile {
  id: string;
  handle: "nate" | "brandon" | null;
  role: "admin" | "staff" | null;
  display_name: string | null;
}

/** The signed-in user and their `profiles` row (null when absent). Cached per request. */
export const getSession = cache(
  async (): Promise<{ user: User | null; profile: Profile | null }> => {
    const supabase = createSupabaseServer();
    if (!supabase) return { user: null, profile: null };
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { user: null, profile: null };
    const { data: row } = await supabase
      .from("profiles")
      .select("id, handle, role, display_name")
      .eq("id", data.user.id)
      .maybeSingle();
    // untyped client (no generated Database type yet): the select above is the shape
    return { user: data.user, profile: (row as Profile | null) ?? null };
  }
);
