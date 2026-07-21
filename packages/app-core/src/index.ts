/**
 * @nseluga/app-core — shared application core: pricing/billing math,
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
  decideAccess,
  decideFromEvent,
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
} from "./webhooks";

export { type StorageAdapter } from "./storage";
