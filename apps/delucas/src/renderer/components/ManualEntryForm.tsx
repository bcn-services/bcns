"use client";

/**
 * ManualEntryForm — lets the user enter a transaction by hand.
 *
 * Big inputs, plain English labels. No jargon. Calls
 * window.bridge.ingestion.submitManual() on submit.
 *
 * Props:
 *   onSuccess(report) — called after the transaction is saved
 *   onCancel          — called when the user dismisses without saving
 */

import React, { useState } from "react";
import type { NewTransaction, TransactionDirection, TransactionCategory } from "../../shared/types";
import type { IngestionRunReportBridge } from "../../bridge/BridgeInterface";

interface ManualEntryFormProps {
  onSuccess: (report: IngestionRunReportBridge) => void;
  onCancel: () => void;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function ManualEntryForm({ onSuccess, onCancel }: ManualEntryFormProps): React.JSX.Element {
  const [direction, setDirection] = useState<TransactionDirection>("expense");
  const [date, setDate] = useState(TODAY);
  const [amountDollars, setAmountDollars] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("other");
  const [vendor, setVendor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    const dollars = parseFloat(amountDollars);
    if (isNaN(dollars) || dollars <= 0) {
      setError("Please enter a valid amount greater than $0.");
      return;
    }
    if (!vendor.trim()) {
      setError("Please enter who this was paid to (or received from).");
      return;
    }
    if (!date) {
      setError("Please enter a date.");
      return;
    }

    const tx: NewTransaction = {
      date,
      amount_cents: Math.round(dollars * 100),
      direction,
      category,
      vendor: vendor.trim(),
      source: "manual",
      source_ref: null,
    };

    setSubmitting(true);
    try {
      const report = await window.bridge.ingestion.submitManual(tx);
      onSuccess(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Money in / Money out */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">What kind of transaction?</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDirection("revenue")}
            className={[
              "flex-1 py-3 rounded-lg border-2 text-sm font-semibold transition-colors",
              direction === "revenue"
                ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "border-border text-muted-foreground hover:border-green-400",
            ].join(" ")}
          >
            Money In (Revenue)
          </button>
          <button
            type="button"
            onClick={() => setDirection("expense")}
            className={[
              "flex-1 py-3 rounded-lg border-2 text-sm font-semibold transition-colors",
              direction === "expense"
                ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "border-border text-muted-foreground hover:border-red-400",
            ].join(" ")}
          >
            Money Out (Expense)
          </button>
        </div>
      </div>

      {/* Date */}
      <div>
        <label htmlFor="manual-date" className="block text-sm font-medium text-foreground mb-1">
          Date
        </label>
        <input
          id="manual-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="manual-amount" className="block text-sm font-medium text-foreground mb-1">
          Amount ($)
        </label>
        <input
          id="manual-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          value={amountDollars}
          onChange={(e) => setAmountDollars(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      {/* Who paid / who received */}
      <div>
        <label htmlFor="manual-vendor" className="block text-sm font-medium text-foreground mb-1">
          {direction === "expense" ? "Paid to" : "Received from"}
        </label>
        <input
          id="manual-vendor"
          type="text"
          placeholder={direction === "expense" ? "e.g. Sysco Foods, Con Edison" : "e.g. DoorDash, Customer"}
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      {/* Category */}
      <div>
        <label htmlFor="manual-category" className="block text-sm font-medium text-foreground mb-1">
          Category
        </label>
        <select
          id="manual-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as TransactionCategory)}
          className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="food">Food &amp; Ingredients</option>
          <option value="beverage">Beverages</option>
          <option value="utilities">Utilities</option>
          <option value="rent">Rent</option>
          <option value="labor">Labor / Staff</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Error */}
      {error !== null && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save Transaction"}
        </button>
      </div>
    </form>
  );
}
