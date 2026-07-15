/**
 * TransactionList — current-month transactions with inline edit and delete.
 *
 * Edit opens an inline form (same row). Delete prompts inline confirm.
 * After a mutation, calls onMutated() so the parent can refresh headline numbers.
 *
 * Renderer only — no node:* or electron imports.
 */

import React, { useState } from "react";
import type { Transaction, TransactionCategory, TransactionDirection } from "../../shared/types";

interface TransactionListProps {
  transactions: Transaction[];
  onMutated: () => void;
}

function formatCents(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100);
  const remaining = Math.abs(cents) % 100;
  const dollarsStr = dollars.toLocaleString("en-US");
  if (remaining === 0) return `$${dollarsStr}`;
  return `$${dollarsStr}.${remaining.toString().padStart(2, "0")}`;
}

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  food: "Food",
  beverage: "Beverage",
  utilities: "Utilities",
  rent: "Rent",
  labor: "Labor",
  other: "Other",
};

interface EditState {
  date: string;
  amountDollars: string;
  direction: TransactionDirection;
  category: TransactionCategory;
  vendor: string;
}

interface EditRowProps {
  tx: Transaction;
  onSave: (updates: EditState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function EditRow({ tx, onSave, onCancel, saving, error }: EditRowProps): React.JSX.Element {
  const [state, setState] = useState<EditState>({
    date: tx.date,
    amountDollars: (tx.amount_cents / 100).toFixed(2),
    direction: tx.direction,
    category: tx.category,
    vendor: tx.vendor,
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    onSave(state);
  }

  return (
    <tr className="bg-muted/30">
      <td colSpan={5} className="px-3 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end text-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Date</label>
            <input
              type="date"
              value={state.date}
              onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
              className="border border-input bg-background rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={state.amountDollars}
              onChange={(e) => setState((s) => ({ ...s, amountDollars: e.target.value }))}
              className="w-24 border border-input bg-background rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              value={state.direction}
              onChange={(e) => setState((s) => ({ ...s, direction: e.target.value as TransactionDirection }))}
              className="border border-input bg-background rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <select
              value={state.category}
              onChange={(e) => setState((s) => ({ ...s, category: e.target.value as TransactionCategory }))}
              className="border border-input bg-background rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
            <label className="text-xs text-muted-foreground">Vendor</label>
            <input
              type="text"
              value={state.vendor}
              onChange={(e) => setState((s) => ({ ...s, vendor: e.target.value }))}
              className="border border-input bg-background rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              required
            />
          </div>
          <div className="flex gap-2 self-end">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error !== null && (
            <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </form>
      </td>
    </tr>
  );
}

export function TransactionList({ transactions, onMutated }: TransactionListProps): React.JSX.Element {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function handleSave(tx: Transaction, updates: EditState): Promise<void> {
    const dollars = parseFloat(updates.amountDollars);
    if (isNaN(dollars) || dollars <= 0) {
      setEditError("Amount must be greater than $0.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const result = await window.bridge.db.updateTransaction(tx.id, {
        date: updates.date,
        amount_cents: Math.round(dollars * 100),
        direction: updates.direction,
        category: updates.category,
        vendor: updates.vendor.trim(),
      });
      if (!result.ok) {
        setEditError(result.error ?? "Failed to save changes.");
        return;
      }
      setEditingId(null);
      onMutated();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setSaving(true);
    try {
      const result = await window.bridge.db.deleteTransaction(id);
      if (result.ok) {
        setDeletingId(null);
        onMutated();
      } else {
        console.error("[TransactionList] delete failed", result.error);
      }
    } catch (err) {
      console.error("[TransactionList] delete error", err);
    } finally {
      setSaving(false);
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
        No transactions this month
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.map((tx) => {
            if (editingId === tx.id) {
              return (
                <EditRow
                  key={tx.id}
                  tx={tx}
                  onSave={(updates) => { void handleSave(tx, updates); }}
                  onCancel={() => { setEditingId(null); setEditError(null); }}
                  saving={saving}
                  error={editError}
                />
              );
            }

            return (
              <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 text-foreground">{tx.date}</td>
                <td className="px-3 py-2 text-foreground">{tx.vendor}</td>
                <td className="px-3 py-2 text-muted-foreground">{CATEGORY_LABELS[tx.category]}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${tx.direction === "revenue" ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                  {tx.direction === "revenue" ? "+" : "-"}{formatCents(tx.amount_cents)}
                </td>
                <td className="px-3 py-2 text-right">
                  {deletingId === tx.id ? (
                    <span className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-muted-foreground">Delete?</span>
                      <button
                        type="button"
                        onClick={() => { void handleDelete(tx.id); }}
                        disabled={saving}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        disabled={saving}
                        className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-3 justify-end">
                      <button
                        type="button"
                        onClick={() => { setEditingId(tx.id); setEditError(null); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(tx.id)}
                        className="text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
