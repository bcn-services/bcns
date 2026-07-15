/**
 * types.ts — Shared TypeScript types used across shell and renderer.
 *
 * NO imports from electron or node:* allowed here — this file must be
 * importable from both processes and from headless unit tests.
 */

// ---------------------------------------------------------------------------
// Literal union types
// ---------------------------------------------------------------------------

export type TransactionDirection = "revenue" | "expense";

export type TransactionCategory =
  | "food"
  | "beverage"
  | "utilities"
  | "rent"
  | "labor"
  | "other";

export type TransactionSource = "email" | "dragdrop" | "manual" | "recurring";

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export interface Transaction {
  id: number;
  /** ISO 8601 date string: YYYY-MM-DD */
  date: string;
  /** Amount in cents (integer — never float) */
  amount_cents: number;
  direction: TransactionDirection;
  category: TransactionCategory;
  vendor: string;
  source: TransactionSource;
  /** Opaque reference to the originating source (email message-id, file path, etc.) */
  source_ref: string | null;
  /** ISO 8601 datetime string */
  created_at: string;
}

export interface NewTransaction {
  date: string;
  amount_cents: number;
  direction: TransactionDirection;
  category: TransactionCategory;
  vendor: string;
  source: TransactionSource;
  source_ref?: string | null;
}

export interface RecurringRule {
  id: number;
  /** Human-readable label, e.g. "Rent" */
  label: string;
  amount_cents: number;
  direction: TransactionDirection;
  category: TransactionCategory;
  vendor: string;
  /** Day of month (1-28) on which the recurring transaction falls */
  day_of_month: number;
  /** ISO 8601 date on which the rule becomes active */
  start_date: string;
  /** ISO 8601 date on which the rule expires (null = ongoing) */
  end_date: string | null;
}

export interface ProcessedEmail {
  id: number;
  /** RFC 5322 Message-ID header value — used for deduplication */
  message_id: string;
  processed_at: string;
}

export interface Setting {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// P&L types
// ---------------------------------------------------------------------------

export interface CategoryBreakdown {
  food: number;
  beverage: number;
  utilities: number;
  rent: number;
  labor: number;
  other: number;
}

export interface MonthPnl {
  /** "YYYY-MM" */
  month: string;
  revenue_cents: number;
  expense_cents: number;
  profit_cents: number;
  expense_by_category: CategoryBreakdown;
}
