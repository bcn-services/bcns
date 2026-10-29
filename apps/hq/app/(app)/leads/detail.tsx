"use server";

import type { ReactNode } from "react";
import { LeadDrawerCalls } from "@/components/LeadDrawerCalls";
import { LeadDrawerDetails } from "@/components/LeadDrawerDetails";
import { loadLeadDetail } from "@/lib/leads";
import { getSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase";

export type Detail = { ok: true; details: ReactNode; calls: ReactNode } | { ok: false; error: string };

/** The drawer's Details and Calls bodies for one lead, fetched when the lead is selected (the grid carries no research, calls, notes or links). */
export async function loadDetail(id: string): Promise<Detail> {
  try {
    const { user, profile } = await getSession();
    const sb = createSupabaseServer();
    if (!user || !profile || !sb) return { ok: false, error: "not signed in" };
    const d = await loadLeadDetail(sb, id);
    if (!d) return { ok: false, error: "lead not found" };
    return { ok: true, details: <LeadDrawerDetails lead={d.lead} x={d.x} />, calls: <LeadDrawerCalls x={d.x} /> };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}
