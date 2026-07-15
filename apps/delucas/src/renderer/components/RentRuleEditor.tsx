/**
 * RentRuleEditor — view/edit/add/delete recurring rules.
 *
 * Lists all recurring rules from the bridge. Supports adding a new rule,
 * editing an existing rule inline, and deleting a rule.
 *
 * Renderer only — no node:* or electron imports.
 */

import React, { useEffect, useState, useCallback } from "react";
import type { RecurringRule, TransactionCategory, TransactionDirection } from "../../shared/types";

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  food: "Food & Ingredients",
  beverage: "Beverages",
  utilities: "Utilities",
  rent: "Rent",
  labor: "Labor / Staff",
  other: "Other",
};

function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remaining = cents % 100;
  const dollarsStr = dollars.toLocaleString("en-US");
  if (remaining === 0) return `$${dollarsStr}`;
  return `$${dollarsStr}.${remaining.toString().padStart(2, "0")}`;
}

interface RuleFormState {
  label: string;
  amountDollars: string;
  direction: TransactionDirection;
  category: TransactionCategory;
  vendor: string;
  day_of_month: string;
  start_date: string;
  end_date: string;
}

const DEFAULT_FORM: RuleFormState = {
  label: "",
  amountDollars: "",
  direction: "expense",
  category: "rent",
  vendor: "",
  day_of_month: "1",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
};

interface RuleFormProps {
  initial: RuleFormState;
  onSave: (state: RuleFormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  submitLabel: string;
}

function RuleForm({ initial, onSave, onCancel, saving, error, submitLabel }: RuleFormProps): React.JSX.Element {
  const [state, setState] = useState<RuleFormState>(initial);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    onSave(state);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Label (e.g. "Rent")</label>
          <input
            type="text"
            value={state.label}
            onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Vendor</label>
          <input
            type="text"
            value={state.vendor}
            onChange={(e) => setState((s) => ({ ...s, vendor: e.target.value }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Amount ($)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={state.amountDollars}
            onChange={(e) => setState((s) => ({ ...s, amountDollars: e.target.value }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Day of month (1–28)</label>
          <input
            type="number"
            min="1"
            max="28"
            value={state.day_of_month}
            onChange={(e) => setState((s) => ({ ...s, day_of_month: e.target.value }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <select
            value={state.direction}
            onChange={(e) => setState((s) => ({ ...s, direction: e.target.value as TransactionDirection }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="expense">Expense</option>
            <option value="revenue">Revenue</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Category</label>
          <select
            value={state.category}
            onChange={(e) => setState((s) => ({ ...s, category: e.target.value as TransactionCategory }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Start date</label>
          <input
            type="date"
            value={state.start_date}
            onChange={(e) => setState((s) => ({ ...s, start_date: e.target.value }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">End date (leave blank for ongoing)</label>
          <input
            type="date"
            value={state.end_date}
            onChange={(e) => setState((s) => ({ ...s, end_date: e.target.value }))}
            className="border border-input bg-background rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : submitLabel}
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
    </form>
  );
}

export function RentRuleEditor(): React.JSX.Element {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchRules = useCallback(async (): Promise<void> => {
    try {
      const r = await window.bridge.db.getRecurringRules();
      setRules(r);
    } catch (err) {
      console.error("[RentRuleEditor] fetch failed", err);
    }
  }, []);

  useEffect(() => { void fetchRules(); }, [fetchRules]);

  function parseFormToRule(state: RuleFormState): { ok: true; rule: Omit<RecurringRule, "id"> } | { ok: false; error: string } {
    const dollars = parseFloat(state.amountDollars);
    if (isNaN(dollars) || dollars <= 0) return { ok: false, error: "Amount must be greater than $0." };
    const dom = parseInt(state.day_of_month, 10);
    if (isNaN(dom) || dom < 1 || dom > 28) return { ok: false, error: "Day of month must be between 1 and 28." };
    if (!state.label.trim()) return { ok: false, error: "Label is required." };
    if (!state.vendor.trim()) return { ok: false, error: "Vendor is required." };
    if (!state.start_date) return { ok: false, error: "Start date is required." };

    return {
      ok: true,
      rule: {
        label: state.label.trim(),
        amount_cents: Math.round(dollars * 100),
        direction: state.direction,
        category: state.category,
        vendor: state.vendor.trim(),
        day_of_month: dom,
        start_date: state.start_date,
        end_date: state.end_date.trim() || null,
      },
    };
  }

  async function handleAdd(state: RuleFormState): Promise<void> {
    const parsed = parseFormToRule(state);
    if (!parsed.ok) { setFormError(parsed.error); return; }
    setSaving(true);
    setFormError(null);
    try {
      const result = await window.bridge.db.insertRecurringRule(parsed.rule);
      if (!result.ok) { setFormError(result.error ?? "Failed to add rule."); return; }
      setShowAddForm(false);
      await fetchRules();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add rule.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number, state: RuleFormState): Promise<void> {
    const parsed = parseFormToRule(state);
    if (!parsed.ok) { setFormError(parsed.error); return; }
    setSaving(true);
    setFormError(null);
    try {
      const result = await window.bridge.db.updateRecurringRule(id, {
        label: parsed.rule.label,
        amount_cents: parsed.rule.amount_cents,
        direction: parsed.rule.direction,
        category: parsed.rule.category,
        vendor: parsed.rule.vendor,
        day_of_month: parsed.rule.day_of_month,
        end_date: parsed.rule.end_date,
      });
      if (!result.ok) { setFormError(result.error ?? "Failed to update rule."); return; }
      setEditingId(null);
      await fetchRules();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update rule.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setSaving(true);
    try {
      await window.bridge.db.deleteRecurringRule(id);
      setDeletingId(null);
      await fetchRules();
    } catch (err) {
      console.error("[RentRuleEditor] delete failed", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Recurring rules
        </p>
        <button
          type="button"
          onClick={() => { setShowAddForm(true); setFormError(null); }}
          className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          + Add rule
        </button>
      </div>

      {showAddForm && (
        <RuleForm
          initial={DEFAULT_FORM}
          onSave={(s) => { void handleAdd(s); }}
          onCancel={() => { setShowAddForm(false); setFormError(null); }}
          saving={saving}
          error={formError}
          submitLabel="Add rule"
        />
      )}

      {rules.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">No recurring rules yet</p>
      )}

      <div className="space-y-2">
        {rules.map((rule) => {
          if (editingId === rule.id) {
            const initialState: RuleFormState = {
              label: rule.label,
              amountDollars: (rule.amount_cents / 100).toFixed(2),
              direction: rule.direction,
              category: rule.category,
              vendor: rule.vendor,
              day_of_month: String(rule.day_of_month),
              start_date: rule.start_date,
              end_date: rule.end_date ?? "",
            };
            return (
              <RuleForm
                key={rule.id}
                initial={initialState}
                onSave={(s) => { void handleUpdate(rule.id, s); }}
                onCancel={() => { setEditingId(null); setFormError(null); }}
                saving={saving}
                error={formError}
                submitLabel="Save changes"
              />
            );
          }

          return (
            <div key={rule.id} className="flex items-center justify-between rounded-xl bg-card border border-border shadow-sm px-4 py-3 text-sm">
              <div>
                <span className="font-medium text-foreground">{rule.label}</span>
                <span className="text-muted-foreground ml-2">
                  {formatCents(rule.amount_cents)} / mo · day {rule.day_of_month} · {CATEGORY_LABELS[rule.category]}
                </span>
              </div>
              <div className="flex gap-3">
                {deletingId === rule.id ? (
                  <>
                    <span className="text-xs text-muted-foreground">Delete?</span>
                    <button
                      type="button"
                      onClick={() => { void handleDelete(rule.id); }}
                      disabled={saving}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(null)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { setEditingId(rule.id); setFormError(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(rule.id)}
                      className="text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
