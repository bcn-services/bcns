/**
 * subscription.ts — Maps Stripe subscription status to an access decision.
 *
 * The status -> decision mapping is an exhaustive switch with NO default: if a
 * new SubStatus is ever added, this file will fail to compile until the new
 * case is handled, rather than silently falling through.
 */

export type SubStatus = "active" | "past_due" | "canceled" | "trialing";

export type AccessDecision = "provision" | "suspend";

/**
 * Decide whether an account should have access based on its subscription
 * status. active/trialing keep access; past_due/canceled lose it.
 */
export function decideAccess(status: SubStatus): AccessDecision {
  switch (status) {
    case "active":
    case "trialing":
      return "provision";
    case "past_due":
    case "canceled":
      return "suspend";
  }
}

export interface StripeSubscriptionEvent {
  type: string;
  status: SubStatus;
  customerId: string;
  subscriptionId: string;
}

/** Convenience wrapper: decide access directly from a Stripe webhook event. */
export function decideFromEvent(e: StripeSubscriptionEvent): AccessDecision {
  return decideAccess(e.status);
}
