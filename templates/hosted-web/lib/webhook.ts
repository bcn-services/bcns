/**
 * webhook.ts — Pure decision logic for the Stripe subscription webhook.
 *
 * All the provisioning/suspension policy routes through @bcns/app-core's pure
 * `decideFromEvent`/`decideAccess`, so it is unit-testable with no Stripe SDK,
 * no network, and no HTTP. The App Router route is a thin adapter over this.
 */

import { decideFromEvent, type AccessDecision, type StripeSubscriptionEvent } from "@bcns/app-core";

export interface WebhookResult {
  decision: AccessDecision;
  customerId: string;
  subscriptionId: string;
}

/**
 * Map a parsed Stripe subscription event to a provision/suspend decision.
 * Delegates the policy to app-core; this function only threads identifiers
 * through so a caller can act on the result (e.g. flip DB access).
 */
export function handleStripeEvent(event: StripeSubscriptionEvent): WebhookResult {
  return {
    decision: decideFromEvent(event),
    customerId: event.customerId,
    subscriptionId: event.subscriptionId,
  };
}
