/**
 * compare-models.ts — one-off e2e helper for the DeLuca's PDF→LLM leg.
 *
 * Renders a real invoice PDF to a PNG (via the app's own pdf.ts path) and runs
 * the SAME extraction prompt through two candidate models, printing the parsed
 * JSON, token usage, and a rough per-call cost for each. Use it to pick the
 * default model in llm.ts (DEFAULT_MODEL) against the client's ~$5/mo cap.
 *
 * Usage (from apps/delucas/, with ANTHROPIC_API_KEY exported):
 *   pnpm exec tsx scripts/compare-models.ts <path-to-invoice.pdf>
 *
 * Not part of the app or the test suite — purely a manual validation aid.
 */

import * as fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { pdfBufferToBase64 } from "../src/shell-electron/ingestion/pdf";
import { SYSTEM_PROMPT, validateLLMResult, stripJsonFence } from "../src/shell-electron/ingestion/llm";

// Models to compare. Add/remove freely.
const MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6"] as const;

// Rough public list prices, USD per 1M tokens (input / output). Update if stale.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
};

async function main(): Promise<void> {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("Usage: tsx scripts/compare-models.ts <path-to-invoice.pdf>");
    process.exit(2);
  }
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.error("ANTHROPIC_API_KEY is not set. Export it first.");
    process.exit(2);
  }

  console.log(`\nRendering ${pdfPath} …`);
  const buffer = fs.readFileSync(pdfPath);
  const base64Image = await pdfBufferToBase64(buffer);
  console.log(`Rendered page 1 → ${Math.round((base64Image.length * 3) / 4 / 1024)} KB PNG\n`);

  const client = new Anthropic({ timeout: 60_000 });

  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: base64Image } },
              { type: "text", text: "Extract the invoice data from this document image." },
            ],
          },
        ],
      });
      const ms = Date.now() - t0;
      const textBlock = response.content.find((b) => b.type === "text");
      const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

      let parsedOk = false;
      let parsedNote = "";
      try {
        validateLLMResult(JSON.parse(stripJsonFence(raw)));
        parsedOk = true;
      } catch (e) {
        parsedNote = e instanceof Error ? e.message : String(e);
      }

      const u = response.usage;
      const price = PRICING[model];
      const cost = price
        ? (u.input_tokens * price.in + u.output_tokens * price.out) / 1_000_000
        : NaN;

      console.log(`──────── ${model} ────────`);
      console.log(raw);
      console.log(
        `validates: ${parsedOk ? "YES" : "NO — " + parsedNote} | ` +
          `in ${u.input_tokens} tok, out ${u.output_tokens} tok | ` +
          `~$${cost.toFixed(5)} | ${ms} ms\n`
      );
    } catch (err) {
      console.log(`──────── ${model} ────────`);
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
