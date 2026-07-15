/**
 * pdf.ts — PDF-to-image conversion for LLM extraction.
 *
 * Converts the first page of a PDF file into a base64-encoded PNG image,
 * suitable for passing to the Anthropic vision API.
 *
 * Uses pdfjs-dist (Node build) + canvas for rendering.
 * Kept in src/shell-electron/ — Node-only module.
 * Renderer must NEVER import this file.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Convert the first page of a PDF file to a base64-encoded PNG.
 *
 * @param filePath - Absolute path to the PDF file
 * @returns Base64-encoded PNG string (no data URI prefix)
 */
export async function pdfFirstPageToBase64(filePath: string): Promise<string> {
  // Validate file exists and has .pdf extension
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`PDF file not found: ${resolved}`);
  }
  if (path.extname(resolved).toLowerCase() !== ".pdf") {
    throw new Error(`File is not a PDF: ${resolved}`);
  }

  const fileBuffer = fs.readFileSync(resolved);
  const uint8Array = new Uint8Array(fileBuffer);

  // Dynamic import to avoid issues with ESM/CJS interop at module load time.
  // pdfjs-dist v4 ships ESM only; the main entry is build/pdf.mjs (pkg "main").
  const pdfjsLib = await import("pdfjs-dist");

  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdfDocument = await loadingTask.promise;

  try {
    if (pdfDocument.numPages === 0) {
      throw new Error("PDF has no pages");
    }

    const page = await pdfDocument.getPage(1);

    // Render at 2x scale for better LLM accuracy
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    // Use @napi-rs/canvas for headless rendering (ships ARM64 Darwin prebuilt binaries)
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height)
    );
    const context = canvas.getContext("2d");

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    // Export as PNG buffer and convert to base64
    const pngBuffer = canvas.toBuffer("image/png");
    return pngBuffer.toString("base64");
  } finally {
    // Destroy the PDF document to release internal pdfjs worker resources
    // regardless of success or failure.
    pdfDocument.destroy();
  }
}
