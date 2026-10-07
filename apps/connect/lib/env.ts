/**
 * env.ts — every value read from process.env at CALL TIME, never at import.
 * Missing values come back undefined and each caller degrades; nothing here
 * throws, so the app builds and boots with no env at all.
 */

function readEnv(name: string): string | undefined {
  const trimmed = process.env[name]?.trim();
  return trimmed ? trimmed : undefined;
}

export interface HubConfig {
  /** Supabase project URL — browser-safe. */
  supabaseUrl?: string;
  /** Supabase anon key — browser-safe, subject to RLS. */
  supabaseAnonKey?: string;
  /** Optional. Unset = connection requests fall back to a mailto link. */
  resendApiKey?: string;
  /** Shopify app client id (public). Unset = the Connect button stays hidden. */
  shopifyClientId?: string;
  /** Shopify app client secret. Server-only: never reaches a client component. */
  shopifyClientSecret?: string;
  /* Meta + Monday OAuth apps (chunk 5 W4). Ids are public; secrets are server-only. */
  metaClientId?: string;
  metaClientSecret?: string;
  mondayClientId?: string;
  mondayClientSecret?: string;
  quickbooksClientId?: string;
  quickbooksClientSecret?: string;
  /**
   * Sources whose OAuth app is approved and may show a "Connect" button.
   * Everything absent from this list keeps the chunk-4 "Request connection"
   * email, so a source stays exactly as it was until its review lands.
   */
  approvedOAuthSources: string[];
  /** Where Shopify sends the browser back. Overridable for a local dev-store install. */
  hubBaseUrl: string;
  /**
   * The `handle` field in shopify.app.toml (W6a follow-up). Next has no
   * access to the toml at runtime, so the hub keeps its own copy here. Read by:
   * the /finish route (finish/route.ts -> shopify-oauth.ts, builds the
   * managed-pricing plan-selection redirect; unset = `plan_handle_unconfigured`,
   * a Shopify-initiated install with no active subscription fails closed to the
   * hub's error page), and the hub page (app/page.tsx: `reopenAppUrl` and, via
   * lib/sources.ts, the Shopify card's install link; unset = both are absent).
   * The OAuth callback route does not read it.
   */
  shopifyAppHandle?: string;
  /**
   * Partner API access for the paid-period check (lib/shopify-oauth.ts,
   * paidThrough): a Partner API client token with "Manage apps" only (server-only
   * secret), the Partner organization id, and the app's `gid://shopify/App/<n>`.
   * Any of the three unset = no Partner call; a reinstall inside a paid period
   * lands on Shopify's plan page, as before.
   */
  shopifyPartnerApiToken?: string;
  shopifyPartnerOrgId?: string;
  shopifyAppGid?: string;
  /**
   * Edge Function URL for `shopify-shop-redact` (docs/architecture/retention-30d-shop-redact.md).
   * Unset, unreachable, timed out, or a non-2xx response = gdprRoute falls back to the operator
   * email exactly as before — this is an upgrade path, not a hard dependency.
   *
   * The same function also takes app/uninstalled (appUninstalledRoute), which has no
   * email fallback: unset or failing there is a non-2xx, so Shopify retries.
   */
  shopRedactFunctionUrl?: string;
  /**
   * SIGNUP_ENABLED=1|true turns on self-service sign-up (P1): the /signup page, the "Create
   * account" link on /login, and the bcns notice on a confirmed sign-up. Anything else = all
   * three are absent and /signup is a 404. The signup Edge Function's own SIGNUP_ENABLED secret
   * is the real switch: without it the function 404s whatever this says.
   */
  signupEnabled: boolean;
  /**
   * Stripe self-serve billing ($200/mo). All server-only. The secret key creates Checkout and
   * billing-portal sessions; the webhook signing secret (whsec_...) verifies Stripe's calls to
   * /api/webhooks/stripe, which forwards them to the `stripe-webhook` Edge Function. Any unset =
   * the Pay button is absent and the webhook answers 503 (Stripe retries).
   */
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceId?: string;
  stripeWebhookFunctionUrl?: string;

  // sb-bridge: remove after SB migrates to bcns Connect
  /** The one store (full *.myshopify.com) that installs the bcns-data app instead. */
  shopifyAltShop?: string; // sb-bridge: remove after SB migrates to bcns Connect
  shopifyAltClientId?: string; // sb-bridge: remove after SB migrates to bcns Connect
  shopifyAltClientSecret?: string; // sb-bridge: remove after SB migrates to bcns Connect
}

/** The hub's own origin in production; matches the redirect URL registered with Shopify. */
export const HUB_BASE_URL = "https://connect.bcn-services.com";

export function getConfig(): HubConfig {
  return {
    supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    resendApiKey: readEnv("RESEND_API_KEY"),
    shopifyClientId: readEnv("SHOPIFY_CLIENT_ID"),
    shopifyClientSecret: readEnv("SHOPIFY_CLIENT_SECRET"),
    metaClientId: readEnv("META_CLIENT_ID"),
    metaClientSecret: readEnv("META_CLIENT_SECRET"),
    mondayClientId: readEnv("MONDAY_CLIENT_ID"),
    mondayClientSecret: readEnv("MONDAY_CLIENT_SECRET"),
    quickbooksClientId: readEnv("QUICKBOOKS_CLIENT_ID"),
    quickbooksClientSecret: readEnv("QUICKBOOKS_CLIENT_SECRET"),
    approvedOAuthSources: (readEnv("OAUTH_APPROVED_SOURCES") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    hubBaseUrl: (readEnv("HUB_BASE_URL") ?? HUB_BASE_URL).replace(/\/+$/, ""),
    shopifyAppHandle: readEnv("SHOPIFY_APP_HANDLE"),
    shopifyPartnerApiToken: readEnv("SHOPIFY_PARTNER_API_TOKEN"),
    shopifyPartnerOrgId: readEnv("SHOPIFY_PARTNER_ORG_ID"),
    shopifyAppGid: readEnv("SHOPIFY_APP_GID"),
    shopRedactFunctionUrl: readEnv("SHOP_REDACT_FUNCTION_URL"),
    signupEnabled: ["1", "true"].includes(readEnv("SIGNUP_ENABLED")?.toLowerCase() ?? ""),
    stripeSecretKey: readEnv("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: readEnv("STRIPE_WEBHOOK_SECRET"),
    stripePriceId: readEnv("STRIPE_PRICE_ID"),
    stripeWebhookFunctionUrl: readEnv("STRIPE_WEBHOOK_FUNCTION_URL"),

    // sb-bridge: remove after SB migrates to bcns Connect
    shopifyAltShop: readEnv("SHOPIFY_ALT_SHOP"), // sb-bridge: remove after SB migrates to bcns Connect
    shopifyAltClientId: readEnv("SHOPIFY_ALT_CLIENT_ID"), // sb-bridge: remove after SB migrates to bcns Connect
    shopifyAltClientSecret: readEnv("SHOPIFY_ALT_CLIENT_SECRET"), // sb-bridge: remove after SB migrates to bcns Connect
  };
}
