"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@bcn-services/tenant";
import { getConfig } from "@/lib/env";
import { checkoutTarget, portalTarget, readBilling } from "@/lib/stripe-billing";

/** A verified user (getUser asks the auth server) and their client's billing row. */
async function signedIn() {
  const supabase = createServerSupabase();
  if (!supabase) redirect("/login?error=unconfigured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=signed-out");
  return { supabase, email: user.email ?? null };
}

/** "Pay": to Stripe Checkout for the signed-in owner's own client. */
export async function startCheckout(): Promise<void> {
  const { supabase, email } = await signedIn();
  redirect(await checkoutTarget(await readBilling(supabase), email, getConfig()));
}

/** "Update card": Stripe's billing portal for the signed-in owner's own customer. */
export async function openBillingPortal(): Promise<void> {
  const { supabase } = await signedIn();
  redirect(await portalTarget(await readBilling(supabase), getConfig()));
}

/**
 * Back from Checkout: the token still says pending until it is reissued. Refresh it
 * (the access-token hook adds the membership once the webhook has activated the
 * client) and go home; still waiting = stay on the "finishing up" screen.
 */
export async function finishActivation(): Promise<void> {
  const { supabase } = await signedIn();
  const billing = await readBilling(supabase);
  if (billing?.status !== "active") redirect("/pending?paid=1&waiting=1");
  await supabase.auth.refreshSession();
  redirect("/");
}
