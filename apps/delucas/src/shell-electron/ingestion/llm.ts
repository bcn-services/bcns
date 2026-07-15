/**
 * llm.ts — LLM extraction module for PDF invoice data.
 *
 * Takes a base64-encoded image of a PDF page and returns structured invoice
 * data via the Anthropic API. Fully mockable via the `mock` parameter.
 *
 * Kept in src/shell-electron/ because it uses @anthropic-ai/sdk (Node-only).
 * Renderer must NEVER import this file.
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Module-scope client — hoisted so timeout applies to every call and the
// instance is not re-created on each extraction request.
// ---------------------------------------------------------------------------

const client = new Anthropic({ timeout: 30_000 });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMExtractResult {
  is_invoice: boolean;
  vendor: string | null;
  /** YYYY-MM-DD or null */
  date: string | null;
  /** Amount in cents (integer) or null */
  amount: number | null;
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an invoice data extractor. Given an image of a document page, extract the following fields and respond with ONLY valid JSON matching this schema exactly:

{
  "is_invoice": boolean,
  "vendor": string or null,
  "date": string (YYYY-MM-DD format) or null,
  "amount": number (total amount in cents, integer) or null,
  "confidence": "high" | "medium" | "low"
}

Rules:
- is_invoice: true only if this looks like an invoice, receipt, or bill
- vendor: the business name issuing the invoice
- date: the invoice date (not due date), formatted as YYYY-MM-DD
- amount: the total amount due/paid, converted to cents (multiply dollars by 100), as an integer
- confidence: "high" if you are very sure, "medium" if somewhat sure, "low" if guessing
- If a field cannot be determined, use null
- Respond with ONLY the JSON object, no explanation or markdown`;

/**
 * Extract invoice data from a base64-encoded image of a PDF page.
 *
 * @param base64Image - Base64-encoded PNG/JPEG image data
 * @param mock - Optional mock result; when provided, returns immediately without hitting the API
 */
export async function extractFromPdfImage(
  base64Image: string,
  mock?: LLMExtractResult
): Promise<LLMExtractResult> {
  // Mockable bypass for tests — no live API call
  if (mock !== undefined) {
    return mock;
  }

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64Image,
            },
          },
          {
            type: "text",
            text: "Extract the invoice data from this document image.",
          },
        ],
      },
    ],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (textBlock === undefined || textBlock.type !== "text") {
    throw new Error("LLM returned no text content");
  }

  const rawText = textBlock.text.trim();

  // Parse and validate JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`LLM returned malformed JSON: ${rawText.slice(0, 200)}`);
  }

  return validateLLMResult(parsed);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Exported for unit testing only — validates and narrows an unknown LLM response. */
export function validateLLMResult(raw: unknown): LLMExtractResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("LLM result is not an object");
  }

  const r = raw as Record<string, unknown>;

  // is_invoice
  if (typeof r["is_invoice"] !== "boolean") {
    throw new Error(`LLM result.is_invoice must be boolean, got ${typeof r["is_invoice"]}`);
  }

  // vendor
  if (r["vendor"] !== null && typeof r["vendor"] !== "string") {
    throw new Error(`LLM result.vendor must be string or null`);
  }

  // date — null or YYYY-MM-DD
  if (r["date"] !== null) {
    if (typeof r["date"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r["date"])) {
      throw new Error(`LLM result.date must be YYYY-MM-DD or null, got ${String(r["date"])}`);
    }
  }

  // amount — null or integer
  if (r["amount"] !== null) {
    if (typeof r["amount"] !== "number" || !Number.isInteger(r["amount"]) || r["amount"] < 0) {
      throw new Error(`LLM result.amount must be a non-negative integer (cents) or null`);
    }
  }

  // confidence
  if (r["confidence"] !== "high" && r["confidence"] !== "medium" && r["confidence"] !== "low") {
    throw new Error(`LLM result.confidence must be 'high', 'medium', or 'low'`);
  }

  return {
    is_invoice: r["is_invoice"] as boolean,
    vendor: r["vendor"] as string | null,
    date: r["date"] as string | null,
    amount: r["amount"] as number | null,
    confidence: r["confidence"] as "high" | "medium" | "low",
  };
}
