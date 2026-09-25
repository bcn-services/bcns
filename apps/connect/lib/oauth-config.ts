/**
 * oauth-config.ts — the per-source approval gate.
 *
 * A source is self-serve only when its app is approved AND its credentials are
 * present. Until then the hub keeps the chunk-4 behaviour exactly: the card
 * shows "Request connection" and lib/request-connection.ts emails bcns. Flipping
 * one source on is an environment change (OAUTH_APPROVED_SOURCES), not a deploy,
 * which is what §5's "the hub flips a source's button when its approval lands"
 * needs — three approvals arriving weeks apart, no code change for any of them.
 */

import type { HubConfig } from "./env";
import type { HubSource } from "./sources";

/** Sources with an OAuth flow built. */
export const OAUTH_SOURCES = ["shopify", "meta", "monday", "quickbooks"] as const;

export type OAuthSource = (typeof OAUTH_SOURCES)[number];

export function isOAuthSource(source: string): source is OAuthSource {
  return (OAUTH_SOURCES as readonly string[]).includes(source);
}

/** Credentials, per source. Kept here so `oauthEnabled` is one total function. */
function hasCredentials(config: HubConfig, source: OAuthSource): boolean {
  if (source === "shopify") return Boolean(config.shopifyClientId && config.shopifyClientSecret);
  if (source === "meta") return Boolean(config.metaClientId && config.metaClientSecret);
  if (source === "monday") return Boolean(config.mondayClientId && config.mondayClientSecret);
  if (source === "quickbooks") return Boolean(config.quickbooksClientId && config.quickbooksClientSecret);
  return false;
}

/**
 * Both halves must be true. The approval list alone is not enough: an operator
 * who lists a source before setting its secret would otherwise send merchants to
 * a consent screen that cannot complete.
 */
export function oauthEnabled(config: HubConfig, source: string): source is OAuthSource {
  if (!isOAuthSource(source)) return false;
  return config.approvedOAuthSources.includes(source) && hasCredentials(config, source);
}

/** Must match the redirect URL registered in the partner dashboard, byte for byte. */
export function redirectUri(config: HubConfig, source: OAuthSource): string {
  return `${config.hubBaseUrl}/api/oauth/${source}/callback`;
}

/** Where a card's button points when the source is self-serve, or null. */
export function connectPath(config: HubConfig, source: HubSource): string | null {
  return oauthEnabled(config, source) ? `/api/oauth/${source}/start` : null;
}
