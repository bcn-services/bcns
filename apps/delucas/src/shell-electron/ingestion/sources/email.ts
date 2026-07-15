/**
 * email.ts — IMAP email ingestion source.
 *
 * Implements IngestionSource. On pull():
 *   1. Connects to IMAP and fetches unprocessed emails with PDF attachments.
 *   2. Converts each PDF to a base64 image and runs LLM extraction.
 *   3. High-confidence invoices → returned as NormalizedTransaction candidates.
 *   4. Medium/low-confidence invoices → added to the review queue (not imported).
 *   5. Non-invoices → skipped.
 *   6. All fetched message-ids are marked processed regardless of outcome.
 *   7. Connection/auth failure → sets emailStatus.error, returns [] (never throws).
 *
 * The `imapFactory` and `mockLlm` constructor params enable full test isolation.
 * Main process only.
 */

import type Database from "better-sqlite3";
import type { IngestionSource, NormalizedTransaction } from "../types";
import type { ImapFlowFactory, ImapConfig } from "../imap";
import type { LLMExtractResult } from "../llm";
import { fetchUnprocessedEmails, recordProcessed, defaultImapFactory } from "../imap";
import { pdfBufferToBase64 } from "../pdf";
import { extractFromPdfImage } from "../llm";
import { loadVendorMap, resolveCategory } from "../vendor-mapping";
import { enqueueReviewItem } from "../review-queue";

/** DI type for the PDF→base64 conversion step. Allows tests to bypass pdfjs. */
export type PdfConverter = (buf: Buffer) => Promise<string>;

/** DI type for the review-queue enqueue step. Allows tests to capture items instead of using the singleton. */
export type ReviewEnqueuer = (messageId: string, extraction: LLMExtractResult) => string;

// ---------------------------------------------------------------------------
// Email connection status
// ---------------------------------------------------------------------------

export interface EmailStatus {
  connected: boolean;
  lastChecked: string | null;
  error: string | null;
}

/**
 * Process-lifetime singleton — reset to defaults on each app launch.
 * This is intentional for v1: status is ephemeral and reflects the state of
 * the current process only. Consumers must not rely on this persisting across
 * restarts.
 */
let emailStatus: EmailStatus = {
  connected: false,
  lastChecked: null,
  error: null,
};

export function getEmailStatus(): EmailStatus {
  return { ...emailStatus };
}

/**
 * Set emailStatus.error from outside this module (e.g. when main process
 * detects a configuration problem before EmailSource.pull() is called).
 */
export function setEmailError(error: string): void {
  emailStatus = { connected: false, lastChecked: null, error };
}

// ---------------------------------------------------------------------------
// EmailSource
// ---------------------------------------------------------------------------

export class EmailSource implements IngestionSource {
  readonly name = "email";

  private readonly db: Database.Database;
  private readonly getConfig: () => ImapConfig | null;
  private readonly imapFactory: ImapFlowFactory;
  /** Injected LLM result for tests — replaces real API call if set */
  private readonly mockLlm?: LLMExtractResult;
  /** Injected PDF converter for tests — replaces pdfBufferToBase64 if set */
  private readonly pdfConverter: PdfConverter;
  /** Injected review-queue enqueuer for tests — allows capturing review items */
  private readonly reviewEnqueuer: ReviewEnqueuer;

  /**
   * @param db - SQLite handle
   * @param getConfig - Callable that returns current IMAP settings, or null if not configured
   * @param imapFactory - Optional factory for DI (default: defaultImapFactory)
   * @param mockLlm - Optional mock LLM result (bypasses real API in tests)
   * @param pdfConverter - Optional PDF→base64 converter (bypasses pdfjs in tests)
   * @param reviewEnqueuer - Optional review-queue enqueuer (bypasses singleton in tests)
   */
  constructor(
    db: Database.Database,
    getConfig: () => ImapConfig | null,
    imapFactory: ImapFlowFactory = defaultImapFactory,
    mockLlm?: LLMExtractResult,
    pdfConverter: PdfConverter = pdfBufferToBase64,
    reviewEnqueuer: ReviewEnqueuer = enqueueReviewItem
  ) {
    this.db = db;
    this.getConfig = getConfig;
    this.imapFactory = imapFactory;
    this.mockLlm = mockLlm;
    this.pdfConverter = pdfConverter;
    this.reviewEnqueuer = reviewEnqueuer;
  }

  async pull(): Promise<NormalizedTransaction[]> {
    const config = this.getConfig();
    if (config === null) {
      // Not configured — not an error, just skip
      emailStatus = { connected: false, lastChecked: null, error: null };
      return [];
    }

    // Load vendor→category map from settings
    const vendorMap = loadVendorMap(this.db);

    let emails: Awaited<ReturnType<typeof fetchUnprocessedEmails>>;
    try {
      emails = await fetchUnprocessedEmails(this.db, config, this.imapFactory);
      emailStatus = {
        connected: true,
        lastChecked: new Date().toISOString(),
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[EmailSource] IMAP connection failed:", msg);
      emailStatus = {
        connected: false,
        lastChecked: new Date().toISOString(),
        error: msg,
      };
      // Never throws — failure is surfaced via status
      return [];
    }

    const transactions: NormalizedTransaction[] = [];

    for (const email of emails) {
      try {
        // Convert PDF buffer to base64 image (injectable for test isolation)
        const base64Image = await this.pdfConverter(email.pdfBuffer);

        // Run LLM extraction (mockLlm used in tests to bypass real API)
        const result = await extractFromPdfImage(base64Image, this.mockLlm);

        if (!result.is_invoice) {
          // Not an invoice — skip, but still mark processed
          recordProcessed(this.db, email.messageId);
          continue;
        }

        if (result.confidence === "high") {
          // Auto-import: apply vendor mapping and build transaction
          const vendor = result.vendor ?? "Unknown";
          const category = resolveCategory(vendor, vendorMap);
          const date = result.date ?? new Date().toISOString().slice(0, 10);
          const amount_cents = result.amount ?? 0;

          transactions.push({
            date,
            amount_cents,
            direction: "expense",
            category,
            vendor,
            source: "email",
            source_ref: email.messageId,
          });
        } else {
          // Medium/low confidence — queue for user review
          this.reviewEnqueuer(email.messageId, result);
        }

        // Mark processed regardless of confidence (re-runs won't re-fetch)
        recordProcessed(this.db, email.messageId);
      } catch (err) {
        console.error(`[EmailSource] failed to process email ${email.messageId}:`, err);
        // Mark processed to avoid retrying a broken email forever
        try {
          recordProcessed(this.db, email.messageId);
        } catch {
          // Best-effort
        }
      }
    }

    return transactions;
  }
}
