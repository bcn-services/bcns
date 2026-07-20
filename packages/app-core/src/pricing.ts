/**
 * pricing.ts — Single source of truth for all billing numbers.
 *
 * Money is represented as integer cents everywhere to avoid floating-point
 * drift. Every rate/threshold lives in this file; billing functions read from
 * the exported constants rather than duplicating magic numbers.
 */

export type Tier = "standard" | "advanced";

export interface TierPricing {
  setupCents: number;
  monthlyCents: number;
}

/** Seats bundled into every plan before per-seat overage applies. */
export const INCLUDED_SEATS = 15;

/** Cost of each seat beyond {@link INCLUDED_SEATS}, in cents ($20/seat). */
export const PER_SEAT_CENTS = 20_00;

/** The only place tier prices are defined. */
export const PRICING: Readonly<Record<Tier, TierPricing>> = {
  standard: { setupCents: 1_000_00, monthlyCents: 149_00 },
  advanced: { setupCents: 3_000_00, monthlyCents: 349_00 },
};

/**
 * Format integer cents as a whole-dollar USD string with thousands separators.
 * Only whole dollars are shown (all prices here are whole-dollar amounts).
 * e.g. 149_00 -> "$149", 1_000_00 -> "$1,000".
 */
export function formatUsd(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
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
