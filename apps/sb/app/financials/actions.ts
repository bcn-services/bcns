"use server";

/**
 * Server actions for the /financials manual entries panel.
 *
 * Validation happens here and nowhere else that counts: the form's `type`,
 * `min`, `step` and `maxlength` attributes are convenience, and a rejected
 * submission never reaches an RPC. Failures come back as an `?error=<code>`
 * on the page (codes, not free text, so nothing arbitrary can be rendered),
 * with the typed values echoed so the form is not wiped.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDataClient } from "@/lib/data";
import {
  FINANCIAL_ENTRY_KIND,
  FINANCIAL_ENTRY_SOURCE,
  SECTOR_BUDGET_KIND,
  SECTOR_ASSIGNMENT_KIND,
  entryAttributes,
  parseEntryInput,
  parseAssignInput,
  parseBulkAssignInput,
  parseSectorBudgetInput,
  parseUnassignInput,
  sectorAssignmentAttributes,
  sectorAssignmentExternalId,
  sectorBudgetAttributes,
  sectorBudgetExternalId,
  sectorLabel,
  type EntryErrorCode,
} from "@/lib/financials";
import { isValidYmd } from "@/lib/overview";

function rangeParams(form: FormData): URLSearchParams {
  const params = new URLSearchParams();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (isValidYmd(from) && isValidYmd(to)) {
    params.set("from", from);
    params.set("to", to);
  }
  return params;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The idempotency token the form rendered, used as `save_record`'s
 *  `external_id` — it upserts on (client_id, source, external_id), so a
 *  resubmitted form updates its row instead of inserting a duplicate. Anything
 *  that is not a UUID is ignored and a fresh one is minted, so a client can
 *  only ever address a key it could have been given. */
function entryToken(form: FormData): string {
  const token = String(form.get("token") ?? "").trim();
  return UUID_RE.test(token) ? token : crypto.randomUUID();
}

function fail(form: FormData, code: EntryErrorCode, echo: boolean): never {
  const params = rangeParams(form);
  params.set("error", code);
  if (echo) {
    for (const field of ["date", "type", "category", "amount", "note"] as const) {
      const v = String(form.get(field) ?? "");
      if (v) params.set(`f_${field}`, v);
    }
  }
  redirect(`/financials?${params.toString()}`);
}

function done(form: FormData): never {
  revalidatePath("/financials");
  revalidatePath("/");
  const qs = rangeParams(form).toString();
  redirect(qs ? `/financials?${qs}` : "/financials");
}

export async function createFinancialEntry(form: FormData): Promise<void> {
  const parsed = parseEntryInput({
    date: form.get("date"),
    type: form.get("type"),
    category: form.get("category"),
    amount: form.get("amount"),
    note: form.get("note"),
  });
  if (!parsed.ok) fail(form, parsed.code, true);

  const client = await getDataClient();
  if (!client) fail(form, "save", true);

  try {
    await client.rpc.save_record({
      kind: FINANCIAL_ENTRY_KIND,
      attributes: entryAttributes(parsed.value),
      external_id: entryToken(form),
      title: parsed.value.category,
      occurred_at: parsed.value.date,
    });
  } catch (err) {
    console.error("financials: save_record failed", err instanceof Error ? err.message : err);
    fail(form, "save", true);
  }
  done(form);
}

export async function deleteFinancialEntry(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "").trim();
  if (!id) fail(form, "missing", false);

  const client = await getDataClient();
  if (!client) fail(form, "delete", false);

  // The id arrives from a form, so confirm it really is one of this client's
  // dashboard financial entries before deleting — never a Shopify or Meta row.
  const { data, error } = await client.views
    .records_v1("id,kind,source")
    .eq("id", id)
    .eq("kind", FINANCIAL_ENTRY_KIND)
    .eq("source", FINANCIAL_ENTRY_SOURCE)
    .limit(1);
  if (error) {
    console.error("financials: records_v1 lookup failed", error);
    fail(form, "delete", false);
  }
  if (!data?.length) fail(form, "missing", false);

  try {
    await client.rpc.delete_record({ record_id: id });
  } catch (err) {
    console.error("financials: delete_record failed", err instanceof Error ? err.message : err);
    fail(form, "delete", false);
  }
  done(form);
}

/* ------------------------------------------------------------------ *
 * QuickBooks quarterly budget + recent transactions.
 *
 * The quarter and sector are both constrained to a fixed, known shape (a
 * `/^\d{4}Q[1-4]$/` string; one of the five sector slugs) before any RPC is
 * issued — the same trust-boundary rule as the manual-entry gate above. None
 * of these four writes ever calls delete_record: an unassign is a plain
 * save_record upsert onto the assignment row with `sector: null`.
 *
 * These controls have no dedicated error banner (drag-and-drop, a native
 * <select>, and a plain number input already constrain what a form can send),
 * so a rejected submission is logged and the page just re-renders unchanged
 * rather than growing a second error-code vocabulary.
 * ------------------------------------------------------------------ */

function backToFinancials(form: FormData): never {
  revalidatePath("/financials");
  const qs = rangeParams(form).toString();
  redirect(qs ? `/financials?${qs}` : "/financials");
}

export async function setSectorBudget(form: FormData): Promise<void> {
  const parsed = parseSectorBudgetInput({ quarter: form.get("quarter"), sector: form.get("sector"), budget: form.get("budget") });
  if (!parsed.ok) {
    console.error("financials: setSectorBudget rejected", parsed.code);
    backToFinancials(form);
  }

  const client = await getDataClient();
  if (!client) backToFinancials(form);

  try {
    await client.rpc.save_record({
      kind: SECTOR_BUDGET_KIND,
      attributes: sectorBudgetAttributes(parsed.value),
      external_id: sectorBudgetExternalId(parsed.value.quarter, parsed.value.sector),
      title: sectorLabel(parsed.value.sector),
    });
  } catch (err) {
    console.error("financials: save_record (sector_budget) failed", err instanceof Error ? err.message : err);
  }
  backToFinancials(form);
}

export async function assignTransaction(form: FormData): Promise<void> {
  const parsed = parseAssignInput({ txn: form.get("txn"), sector: form.get("sector") });
  if (!parsed.ok) {
    console.error("financials: assignTransaction rejected", parsed.code);
    backToFinancials(form);
  }

  const client = await getDataClient();
  if (!client) backToFinancials(form);

  try {
    await client.rpc.save_record({
      kind: SECTOR_ASSIGNMENT_KIND,
      attributes: sectorAssignmentAttributes(parsed.value.txn, parsed.value.sector),
      external_id: sectorAssignmentExternalId(parsed.value.txn),
    });
  } catch (err) {
    console.error("financials: save_record (sector_assignment) failed", err instanceof Error ? err.message : err);
  }
  backToFinancials(form);
}

export async function unassignTransaction(form: FormData): Promise<void> {
  const parsed = parseUnassignInput({ txn: form.get("txn") });
  if (!parsed.ok) {
    console.error("financials: unassignTransaction rejected", parsed.code);
    backToFinancials(form);
  }

  const client = await getDataClient();
  if (!client) backToFinancials(form);

  try {
    await client.rpc.save_record({
      kind: SECTOR_ASSIGNMENT_KIND,
      attributes: sectorAssignmentAttributes(parsed.value.txn, null),
      external_id: sectorAssignmentExternalId(parsed.value.txn),
    });
  } catch (err) {
    console.error("financials: save_record (sector_assignment unassign) failed", err instanceof Error ? err.message : err);
  }
  backToFinancials(form);
}

export async function bulkAssign(form: FormData): Promise<void> {
  const parsed = parseBulkAssignInput({ txns: form.getAll("txns"), sector: form.get("sector") });
  if (!parsed.ok) {
    console.error("financials: bulkAssign rejected", parsed.code);
    backToFinancials(form);
  }

  const client = await getDataClient();
  if (!client) backToFinancials(form);

  const { txns, sector } = parsed.value;
  const results = await Promise.allSettled(
    txns.map((txn) =>
      client.rpc.save_record({
        kind: SECTOR_ASSIGNMENT_KIND,
        attributes: sectorAssignmentAttributes(txn, sector),
        external_id: sectorAssignmentExternalId(txn),
      }),
    ),
  );
  for (const r of results) {
    if (r.status === "rejected") console.error("financials: save_record (bulk sector_assignment) failed", r.reason);
  }
  backToFinancials(form);
}
