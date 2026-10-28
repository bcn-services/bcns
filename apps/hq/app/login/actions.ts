"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase";

const field = (form: FormData, k: string) => String(form.get(k) ?? "");
const emailOf = (form: FormData) => field(form, "email").trim().slice(0, 254);
/** /login?<mode…>&error=<code>&email=<who>: the page names the email in its message. */
const back = (q: Record<string, string>) => `/login?${new URLSearchParams(q)}`;

export async function signInWithPassword(form: FormData): Promise<void> {
  const email = emailOf(form);
  const supabase = createSupabaseServer();
  if (!supabase) redirect(back({ error: "unconfigured" }));
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: field(form, "password"),
  });
  // 4xx is Supabase refusing the credentials; anything else (network, 5xx) is not the user's mistake.
  // ponytail: with the anon key, an unknown email and a wrong password look the same ("invalid_credentials"),
  // so "wrong password for <email>" covers both. Telling them apart needs a service-role lookup, not worth it.
  if (error || !data.user) {
    const st = error?.status ?? 0;
    // 429 is GoTrue's sign-in rate limit: say so, or a correct password keeps being retried into it
    redirect(
      back({ error: st === 429 ? "rate" : st > 0 && st < 500 ? "invalid" : "failed", email })
    );
  }
  // A valid auth user with no profiles row is not HQ staff: the gate would bounce them anyway, so say why.
  const { data: row } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!row) {
    await supabase.auth.signOut();
    redirect(back({ error: "no-profile", email }));
  }
  redirect("/");
}

/** Sends the reset email. Always lands on "sent" for a well-formed request, so this form does not reveal who has an account. */
export async function requestPasswordReset(form: FormData): Promise<void> {
  const email = emailOf(form);
  const supabase = createSupabaseServer();
  if (!supabase) redirect(back({ mode: "forgot", error: "unconfigured" }));
  if (!email) redirect(back({ mode: "forgot" }));
  // The public origin comes from Host (nginx sets it), as gate.toLogin does; never X-Forwarded-Host.
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: host ? `${proto}://${host}/reset` : undefined,
  });
  // Any 4xx (an unknown email, and a known one inside its ~60 s send window: 429) lands on "sent", or the form
  // would tell strangers from account holders. Only a 5xx / network failure (status 0) is the user's to retry.
  const down = error && !(error.status && error.status < 500);
  redirect(back({ mode: "forgot", [down ? "error" : "sent"]: down ? "failed" : "1", email }));
}
