/**
 * pricing.ts — Single source of truth for all billing numbers.
 *
 * Money is represented as integer cents everywhere to avoid floating-point
 * drift. Every rate/threshold lives in this file; billing functions read from
 * the exported constants rather than duplicating magic numbers.
 */

export type Tier = "standard" | "advanced";

export interface TierPricing {
  readonly setupCents: number;
  readonly monthlyCents: number;
}

/** Seats bundled into every plan before per-seat overage applies. */
export const INCLUDED_SEATS = 15;

/** Cost of each seat beyond {@link INCLUDED_SEATS}, in cents ($20/seat). */
export const PER_SEAT_CENTS = 20_00;

/**
 * The only place tier prices are defined.
 *
 * Deep-frozen at runtime (not merely `Readonly<>`-typed): consumers compile the
 * raw `.ts`, where TS's `readonly`/`Readonly<>` is erased, so without
 * `Object.freeze` a consumer could do `PRICING.standard.monthlyCents = 1` and
 * poison this shared single-source-of-truth. Freezing the map AND each tier
 * object makes any such mutation throw in strict mode (or silently no-op).
 */
export const PRICING: Readonly<Record<Tier, TierPricing>> = Object.freeze({
  standard: Object.freeze({ setupCents: 1_000_00, monthlyCents: 149_00 }),
  advanced: Object.freeze({ setupCents: 3_000_00, monthlyCents: 349_00 }),
} as const);

/**
 * Format integer cents as a USD string with thousands separators.
 *
 * Renders exact dollars-and-cents when there are cents (149_99 -> "$149.99")
 * and bare whole dollars when the amount is even (149_00 -> "$149",
 * 1_000_00 -> "$1,000"). Negative amounts are valid (refunds/credits) and
 * render with a leading sign: -20_00 -> "-$20". Non-finite input (NaN,
 * Infinity) is rejected with an error, mirroring the seat guard's fail-fast.
 */
export function formatUsd(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error(`cents must be a finite number, got: ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const remCents = abs % 100;
  const dollarsStr = dollars.toLocaleString("en-US");
  if (remCents === 0) {
    return `${sign}$${dollarsStr}`;
  }
  return `${sign}$${dollarsStr}.${remCents.toString().padStart(2, "0")}`;
}

export interface MonthlyCharge {
  tier: Tier;
  seats: number;
  baseCents: number;
  overageSeats: number;
  overageCents: number;
  totalCents: number;
}

function assertSeatCount(seats: number): void {
  if (!Number.isInteger(seats) || seats < 0) {
    throw new Error(`seats must be a non-negative integer, got: ${seats}`);
  }
}

/**
 * Compute the monthly charge for a tier at a given seat count. The base is the
 * tier's flat monthly price; overage is charged per seat beyond the included
 * allotment. All amounts are integer cents.
 */
export function monthlyCharge(tier: Tier, seats: number): MonthlyCharge {
  assertSeatCount(seats);
  const baseCents = PRICING[tier].monthlyCents;
  const overageSeats = Math.max(0, seats - INCLUDED_SEATS);
  const overageCents = overageSeats * PER_SEAT_CENTS;
  return {
    tier,
    seats,
    baseCents,
    overageSeats,
    overageCents,
    totalCents: baseCents + overageCents,
  };
}

/** One-time setup fee for a tier, in integer cents. */
export function setupFeeCents(tier: Tier): number {
  return PRICING[tier].setupCents;
}
