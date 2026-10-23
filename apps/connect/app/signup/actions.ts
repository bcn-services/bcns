"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { payFirstTarget, signupConfirmPath, signupTarget } from "@/lib/signup";
import { SHOPIFY_FROM, SHOPIFY_INSTALL_COOKIE, shopifyInstallCookie } from "@/lib/stripe-billing";

const fields = (form: FormData) => ({
  name: String(form.get("name") ?? ""),
  email: String(form.get("email") ?? ""),
});

/**
 * Step 1 of pay-first sign-up: nothing is created and nobody is charged; the visitor is sent to
 * the confirm view that shows the address back. Server actions are reachable by POST without the
 * page, so the switch is checked here too.
 *
 * A Shopify App Store install (`from=shopify`) keeps the original flow untouched: the signup
 * Edge Function makes a pending workspace and bcns reviews it, because Shopify bills them.
 */
export async function signUp(form: FormData): Promise<void> {
  const config = getConfig();
  if (!config.signupEnabled) notFound();
  if (form.get("from") !== SHOPIFY_FROM) redirect(signupConfirmPath(fields(form)));
  // Signing up during a Shopify App Store install: /pending shows them review, never Pay.
  cookies().set(SHOPIFY_INSTALL_COOKIE, "1", shopifyInstallCookie(config.hubBaseUrl));
  redirect(await signupTarget(fields(form), { supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey }));
}

/** Step 2: the confirmed name + address go to Stripe Checkout (or back with a reason). Still no user. */
export async function confirmSignup(form: FormData): Promise<void> {
  const config = getConfig();
  if (!config.signupEnabled) notFound();
  redirect(await payFirstTarget(fields(form), { supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey, config }));
}
