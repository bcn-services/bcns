"use client";

/**
 * ConfirmCard — shows LLM-extracted invoice data for user review/correction.
 *
 * Displayed after drag-and-drop PDF processing. The user can edit fields,
 * then approve (saves) or reject (discards). On LLM failure, amount is empty
 * so the user can fill it in manually.
 *
 * Props:
 *   extracted  — the LLMExtractResultBridge returned from ingestion:processPdf
 *   filePath   — path of the PDF that was dropped (used as source_ref)
 *   onConfirm  — called with the edited NewTransaction when user approves
 *   onReject   — called when user rejects / cancels
 */

import React, { useState } from "react";
import type { NewTransaction, TransactionDirection, TransactionCategory } from "../../shared/types";
import type { LLMExtractResultBridge } from "../../bridge/BridgeInterface";

interface ConfirmCardProps {
  extracted: LLMExtractResultBridge;
  filePath: string;
  /** Category suggested from the vendor→category map; defaults to "other". */
  suggestedCategory?: TransactionCategory;
  onConfirm: (tx: NewTransaction) => void;
  onReject: () => void;
}

const CONFIDENCE_LABEL: Record<LLMExtractResultBridge["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence — please review",
  low: "Low confidence — please double-check everything",
};

const CONFIDENCE_COLOR: Record<LLMExtractResultBridge["confidence"], string> = {
  high: "text-green-600 dark:text-green-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-red-600 dark:text-red-400",
};

export function ConfirmCard({ extracted, filePath, suggestedCategory = "other", onConfirm, onReject }: ConfirmCardProps): React.JSX.Element {
  const [vendor, setVendor] = useState(extracted.vendor ?? "");
  const [date, setDate] = useState(extracted.date ?? new Date().toISOString().slice(0, 10));
  const [amountDollars, setAmountDollars] = useState(
    extracted.amount !== null ? (extracted.amount / 100).toFixed(2) : ""
  );
  const [direction, setDirection] = useState<TransactionDirection>("expense");
  const [category, setCategory] = useState<TransactionCategory>(suggestedCategory);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm(): void {
    setError(null);
    const dollars = parseFloat(amountDollars);
    if (isNaN(dollars) || dollars <= 0) {
      setError("Please enter a valid amount greater than $0.");
      return;
    }
    if (!vendor.trim()) {
      setError("Please enter the vendor name.");
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
      source: "dragdrop",
      source_ref: filePath,
    };

    onConfirm(tx);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-sm">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-foreground">Review extracted invoice</h2>
          {extracted.is_invoice && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              Invoice detected
            </span>
          )}
        </div>
        <p className={["text-xs font-medium", CONFIDENCE_COLOR[extracted.confidence]].join(" ")}>
          {CONFIDENCE_LABEL[extracted.confidence]}
        </p>
      </div>

      {/* Editable fields */}
      <div className="space-y-4">
        {/* Direction */}
        <div>
          <p className="text-sm font-medium text-foreground mb-2">What kind of transaction?</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDirection("revenue")}
              className={[
                "flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors",
                direction === "revenue"
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "border-border text-muted-foreground hover:border-green-400",
              ].join(" ")}
            >
              Money In
            </button>
            <button
              type="button"
              onClick={() => setDirection("expense")}
              className={[
                "flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors",
                direction === "expense"
                  ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "border-border text-muted-foreground hover:border-red-400",
              ].join(" ")}
            >
              Money Out
            </button>
          </div>
        </div>

        {/* Vendor */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Vendor</label>
          <input
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Who issued this invoice?"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Amount ($)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="food">Food &amp; Ingredients</option>
            <option value="beverage">Beverages</option>
            <option value="utilities">Utilities</option>
            <option value="rent">Rent</option>
            <option value="labor">Labor / Staff</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error !== null && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onReject}
          className="flex-1 py-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Save Invoice
        </button>
      </div>
    </div>
  );
}
