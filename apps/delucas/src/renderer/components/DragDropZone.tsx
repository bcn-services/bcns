"use client";

/**
 * DragDropZone — accepts a dropped or selected PDF, runs LLM extraction,
 * and hands off the result to a ConfirmCard for user review.
 *
 * Flow:
 *   1. User drops a PDF (or clicks "Browse") → dialog:openFile → filePath
 *   2. Renderer calls ingestion:processPdf(filePath) → LLMExtractResult
 *   3. ConfirmCard is shown with the result
 *   4a. User approves → ingestion:confirmImport(editedTx) → onImported(report)
 *   4b. User rejects → back to drop zone
 *
 * On LLM failure, falls back to ConfirmCard with null amount for manual fill.
 */

import React, { useState, useRef } from "react";
import type { NewTransaction, TransactionCategory } from "../../shared/types";
import type { LLMExtractResultBridge, IngestionRunReportBridge } from "../../bridge/BridgeInterface";
import { parseVendorMap, resolveCategory } from "../../shared/vendor-category";
import { ConfirmCard } from "./ConfirmCard";

type ZoneState =
  | { type: "idle" }
  | { type: "processing" }
  | { type: "confirm"; extracted: LLMExtractResultBridge; filePath: string; suggestedCategory: TransactionCategory }
  | { type: "error"; message: string };

/**
 * Suggest a category for the extracted vendor using the saved vendor→category
 * map (the same map the email auto-import uses). Falls back to "other".
 */
async function suggestCategory(vendor: string | null): Promise<TransactionCategory> {
  if (vendor === null || vendor.trim() === "") return "other";
  try {
    const raw = await window.bridge.settings.get("vendor_category_map");
    return resolveCategory(vendor, parseVendorMap(typeof raw === "string" ? raw : null));
  } catch {
    return "other";
  }
}

interface DragDropZoneProps {
  onImported: (report: IngestionRunReportBridge) => void;
}

export function DragDropZone({ onImported }: DragDropZoneProps): React.JSX.Element {
  const [state, setState] = useState<ZoneState>({ type: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(filePath: string): Promise<void> {
    setState({ type: "processing" });
    try {
      const extracted = await window.bridge.ingestion.processPdf(filePath);
      const suggestedCategory = await suggestCategory(extracted.vendor);
      setState({ type: "confirm", extracted, filePath, suggestedCategory });
    } catch (err) {
      // LLM failure: show ConfirmCard with empty fields so user can fill manually
      console.warn("[DragDropZone] processPdf failed, falling back to manual confirm", err);
      const fallback: LLMExtractResultBridge = {
        is_invoice: false,
        vendor: null,
        date: null,
        amount: null,
        confidence: "low",
      };
      setState({ type: "confirm", extracted: fallback, filePath, suggestedCategory: "other" });
    }
  }

  async function handleBrowse(): Promise<void> {
    const filePath = await window.bridge.dialog.openFile({
      filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
    });
    if (filePath === null) return;
    await processFile(filePath);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const pdf = files.find((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdf === undefined) {
      setState({ type: "error", message: "Please drop a PDF file." });
      return;
    }

    // In Electron, dataTransfer.files[n].path gives the local path
    // (Chromium sets it for file:// drops in Electron)
    const filePath = (pdf as File & { path?: string }).path ?? pdf.name;
    if (!filePath || filePath === pdf.name) {
      // Fallback: use dialog if we couldn't get a real path
      await handleBrowse();
      return;
    }

    await processFile(filePath);
  }

  async function handleConfirm(tx: NewTransaction): Promise<void> {
    try {
      const report = await window.bridge.ingestion.confirmImport(tx);
      onImported(report);
      setState({ type: "idle" });
    } catch (err) {
      setState({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save. Please try again.",
      });
    }
  }

  function handleReject(): void {
    setState({ type: "idle" });
  }

  // Show ConfirmCard while in confirm state
  if (state.type === "confirm") {
    return (
      <ConfirmCard
        extracted={state.extracted}
        filePath={state.filePath}
        suggestedCategory={state.suggestedCategory}
        onConfirm={handleConfirm}
        onReject={handleReject}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={handleBrowse}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void handleBrowse(); }}
        className={[
          "rounded-xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3",
          "cursor-pointer transition-colors select-none",
          state.type === "processing"
            ? "border-primary/50 bg-primary/5 cursor-wait"
            : dragOver
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/60 hover:bg-muted/50",
        ].join(" ")}
      >
        {state.type === "processing" ? (
          <>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Reading invoice…</p>
          </>
        ) : (
          <>
            <svg
              className="w-10 h-10 text-muted-foreground/60"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Drop a PDF invoice here</p>
              <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
            </div>
          </>
        )}
      </div>

      {/* Hidden input fallback (unused in Electron but keeps a11y happy) */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Error */}
      {state.type === "error" && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 flex items-start gap-3">
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{state.message}</p>
          <button
            type="button"
            onClick={() => setState({ type: "idle" })}
            className="text-red-500 hover:text-red-700 text-xs font-medium shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
