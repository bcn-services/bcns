/**
 * @bcn-services/app-core — shared application core: pricing/billing math,
 * subscription access decisions, and the BYOK Anthropic client factory.
 */

export {
  type Tier,
  type TierPricing,
  type MonthlyCharge,
  INCLUDED_SEATS,
  PER_SEAT_CENTS,
  PRICING,
  formatUsd,
  monthlyCharge,
  setupFeeCents,
} from "./pricing";

export {
  type SubStatus,
  type AccessDecision,
  type StripeSubscriptionEvent,
  type StripeEvent,
  type BillingSignal,
  type BillingState,
  type BillingAction,
  type BillingView,
  type ClientStatus,
  GRACE_SECONDS,
  decideAccess,
  decideFromEvent,
  billingSignal,
  decideBilling,
  billingView,
  canStartCheckout,
} from "./subscription";

export {
  type ByokDeps,
  type ByokConfig,
  type AiGateConfig,
  type AiGateDeps,
  DEFAULT_MODEL,
  MissingApiKeyError,
  createAnthropicClient,
  maybeCreateAnthropicClient,
} from "./anthropic";

export {
  type HealthConfig,
  type DbStatus,
  type HealthReport,
  type DbPing,
  pingSupabase,
  evaluateHealth,
} from "./health";

export {
  type SignatureVerifier,
  type ProcessedEventStore,
  type WebhookOutcome,
  unverifiedVerifier,
  createMemoryEventStore,
  processWebhook,
  STRIPE_TOLERANCE_SEC,
  verifyStripeSignature,
  stripeVerifier,
} from "./webhooks";

export { type StorageAdapter } from "./storage";
