/**
 * imap.ts — IMAP connection manager for DeLuca's email ingestion.
 *
 * Connects to an IMAP server, fetches messages with PDF attachments that
 * have not yet been processed, and marks message-ids as processed.
 *
 * Uses imapflow (CommonJS) directly via require().
 *
 * The `imapFactory` parameter allows injecting a mock ImapFlow constructor
 * in tests — never hits the live IMAP server in tests.
 *
 * Main process only.
 */

import type Database from "better-sqlite3";
import { isEmailProcessed, markEmailProcessed } from "../db/queries";

// ---------------------------------------------------------------------------
// IMAP config type
// ---------------------------------------------------------------------------

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** App password or IMAP password */
  password: string;
}

// ---------------------------------------------------------------------------
// Minimal ImapFlow surface we need (for DI typing)
// ---------------------------------------------------------------------------

export interface ImapFlowLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(path: string): Promise<unknown>;
  fetchAll(
    range: string,
    query: {
      uid?: boolean;
      envelope?: boolean;
      bodyStructure?: boolean;
    }
  ): Promise<FetchedMessage[]>;
  download(
    range: string,
    part: string,
    options?: { uid?: boolean }
  ): Promise<{ content: NodeJS.ReadableStream }>;
}

export interface MessageStructurePart {
  part?: string;
  type: string;
  disposition?: string;
  dispositionParameters?: Record<string, string>;
  childNodes?: MessageStructurePart[];
}

export interface FetchedMessage {
  uid: number;
  envelope?: {
    messageId?: string;
  };
  bodyStructure?: MessageStructurePart;
}

// ---------------------------------------------------------------------------
// Factory type
// ---------------------------------------------------------------------------

export type ImapFlowFactory = (config: ImapConfig) => ImapFlowLike;

/**
 * Default factory: dynamically requires imapflow (CJS) and constructs a client.
 * Using require() here because imapflow is CommonJS (no ESM wrapper needed).
 */
export function defaultImapFactory(config: ImapConfig): ImapFlowLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImapFlow } = require("imapflow") as { ImapFlow: new (opts: unknown) => ImapFlowLike };
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false, // suppress pino logs
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
  });

  // imapflow is an EventEmitter. A socket-level error (timeout, reset, Gmail
  // dropping an idle connection) is emitted as an 'error' event; with no
  // listener, Node re-throws it as an *uncaught exception* that can crash the
  // Electron main process — even after the fetch already succeeded. The fetch
  // flow surfaces real failures via try/catch + email status, so log and
  // swallow client errors here instead of letting them bubble up.
  const emitter = client as unknown as {
    on?: (event: string, cb: (err: unknown) => void) => void;
  };
  emitter.on?.("error", (err) => {
    console.error(
      "[imap] client error (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
  });

  return client;
}

// ---------------------------------------------------------------------------
// Email attachment extraction
// ---------------------------------------------------------------------------

export interface EmailWithPdf {
  /** RFC 5322 Message-ID, or a fallback uid-based string */
  messageId: string;
  /** PDF attachment content as a Buffer */
  pdfBuffer: Buffer;
}

/**
 * Walk a bodyStructure tree and find all parts with type "application/pdf"
 * or disposition "attachment" with a pdf filename.
 */
function findPdfParts(node: MessageStructurePart): string[] {
  const parts: string[] = [];

  const isPdf =
    node.type.toLowerCase() === "application/pdf" ||
    (node.disposition?.toLowerCase() === "attachment" &&
      (node.dispositionParameters?.["filename"] ?? "").toLowerCase().endsWith(".pdf"));

  if (isPdf && node.part !== undefined) {
    parts.push(node.part);
  }

  if (node.childNodes) {
    for (const child of node.childNodes) {
      parts.push(...findPdfParts(child));
    }
  }

  return parts;
}

/** Maximum attachment size accepted (20 MB). Streams exceeding this are rejected. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Maximum number of unprocessed messages fetched per run. Remaining messages are picked up on the next run. */
const MAX_BATCH_SIZE = 50;

/**
 * Stream a body part to a Buffer.
 * Rejects with an error if the accumulated size exceeds MAX_ATTACHMENT_BYTES.
 */
async function streamToBuffer(
  stream: NodeJS.ReadableStream,
  messageId: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;
    stream.on("data", (chunk: Buffer | string) => {
      if (aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_ATTACHMENT_BYTES) {
        aborted = true;
        // Drain remaining events without accumulating — destroy if supported
        const destroyable = stream as NodeJS.ReadableStream & { destroy?: () => void };
        destroyable.destroy?.();
        const err = new Error(
          `[imap] attachment too large (>${MAX_ATTACHMENT_BYTES} bytes) for message ${messageId} — skipping`
        );
        console.error(err.message);
        reject(err);
        return;
      }
      chunks.push(buf);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

/**
 * Connect to IMAP, fetch unprocessed messages in INBOX that have PDF attachments
 * and have not yet been recorded in processed_emails. Returns an array of
 * EmailWithPdf for the caller to run through LLM extraction.
 *
 * Capped at MAX_BATCH_SIZE (50) unprocessed messages per run — remaining
 * messages are picked up on the next scheduled run.
 *
 * On any connection or auth failure, throws — caller catches and sets status.
 *
 * @param db - SQLite handle for processed_emails lookup
 * @param config - IMAP connection settings
 * @param imapFactory - Optional factory for DI (default: defaultImapFactory)
 */
export async function fetchUnprocessedEmails(
  db: Database.Database,
  config: ImapConfig,
  imapFactory: ImapFlowFactory = defaultImapFactory
): Promise<EmailWithPdf[]> {
  const client = imapFactory(config);
  await client.connect();

  try {
    await client.mailboxOpen("INBOX");

    // Fetch all messages with envelope + bodyStructure to find PDF attachments
    const messages = await client.fetchAll("1:*", {
      uid: true,
      envelope: true,
      bodyStructure: true,
    });

    const results: EmailWithPdf[] = [];

    for (const msg of messages) {
      // Stop once we have reached the per-run batch cap
      if (results.length >= MAX_BATCH_SIZE) break;

      // Determine a stable message-id
      const rawMessageId = msg.envelope?.messageId ?? `uid-${msg.uid}`;
      // Normalize: strip angle brackets if present
      const messageId = rawMessageId.replace(/^<|>$/g, "");

      // Skip if already processed
      if (isEmailProcessed(db, messageId)) continue;

      // Find PDF parts
      if (!msg.bodyStructure) continue;
      const pdfParts = findPdfParts(msg.bodyStructure);
      if (pdfParts.length === 0) continue;

      // Download the first PDF part
      const part = pdfParts[0];
      // `part` is guaranteed non-undefined by the findPdfParts logic
      // (only adds non-undefined parts), but TypeScript needs the check below.
      if (part === undefined) continue;

      try {
        const dl = await client.download(String(msg.uid), part, { uid: true });
        const pdfBuffer = await streamToBuffer(dl.content, messageId);
        results.push({ messageId, pdfBuffer });
      } catch (dlErr) {
        console.error(`[imap] failed to download PDF part ${part} from message ${messageId}`, dlErr);
        // Mark processed on permanent download failure to avoid infinite retry
        recordProcessed(db, messageId);
      }
    }

    return results;
  } finally {
    try {
      await client.logout();
    } catch {
      // Best-effort logout
    }
  }
}

/**
 * Mark a message-id as processed in the database.
 * Idempotent — safe to call multiple times for the same id.
 */
export function recordProcessed(db: Database.Database, messageId: string): void {
  markEmailProcessed(db, messageId);
}
