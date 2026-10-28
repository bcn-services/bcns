"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase";

const MIN_PASSWORD = 8;
const field = (form: FormData, k: string) => String(form.get(k) ?? "");
const to = (q: Record<string, string>) => `/login?${new URLSearchParams(q)}`;

/** The reset link lands on /reset?code=…: trade the one-time code for a session, set the password, go in. */
export async function setNewPassword(form: FormData): Promise<void> {
  const code = field(form, "code");
  const password = field(form, "password");
  const retry = (error: string): never =>
    redirect(`/reset?${new URLSearchParams({ code, error })}`);
  const supabase = createSupabaseServer();
  if (!supabase) redirect(to({ error: "unconfigured" }));
  if (password.length < MIN_PASSWORD) retry("weak");
  if (password !== field(form, "confirm")) retry("mismatch");
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) redirect(to({ mode: "forgot", error: "expired" }));
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    await supabase.auth.signOut();
    redirect(to({ mode: "forgot", error: "failed" }));
  }
  redirect("/"); // the gate checks the profiles row; a stranger with a reset link but no profile is bounced to /login
}
