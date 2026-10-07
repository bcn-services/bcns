"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { signupTarget } from "@/lib/signup";
import { SHOPIFY_FROM, SHOPIFY_INSTALL_COOKIE, shopifyInstallCookie } from "@/lib/stripe-billing";

/** Server actions are reachable by POST without the page, so the switch is checked here too. */
export async function signUp(form: FormData): Promise<void> {
  const config = getConfig();
  if (!config.signupEnabled) notFound();
  // Signing up during a Shopify App Store install: /pending shows them review, never Pay.
  if (form.get("from") === SHOPIFY_FROM) cookies().set(SHOPIFY_INSTALL_COOKIE, "1", shopifyInstallCookie(config.hubBaseUrl));
  redirect(
    await signupTarget(
      {
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
      },
      { supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey }
    )
  );
}
