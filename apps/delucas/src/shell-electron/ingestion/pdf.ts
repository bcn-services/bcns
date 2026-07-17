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
 * Convert the first page of a PDF Buffer to a base64-encoded PNG.
 * Used by the email ingestion path where the PDF is already in memory.
 *
 * @param buffer - Raw PDF bytes
 * @returns Base64-encoded PNG string (no data URI prefix)
 */
export async function pdfBufferToBase64(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  return renderPdfUint8Array(uint8Array);
}

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
  return renderPdfUint8Array(uint8Array);
}

async function renderPdfUint8Array(uint8Array: Uint8Array): Promise<string> {

  // Use @napi-rs/canvas for headless rendering (ships ARM64 Darwin prebuilt
  // binaries). It also supplies the browser globals that pdfjs's canvas
  // renderer expects but that Node / the Electron main process do not define
  // (Path2D, DOMMatrix, ImageData). Without these, glyph rendering throws
  // "Path2D is not defined".
  const canvasMod = await import("@napi-rs/canvas");
  const g = globalThis as unknown as Record<string, unknown>;
  if (g["Path2D"] === undefined) g["Path2D"] = canvasMod.Path2D;
  if (g["DOMMatrix"] === undefined) g["DOMMatrix"] = canvasMod.DOMMatrix;
  if (g["ImageData"] === undefined) g["ImageData"] = canvasMod.ImageData;

  // Use pdfjs's "legacy" build — the default modern build assumes a browser
  // environment and warns/fails under Node. Dynamic import avoids ESM/CJS
  // interop issues at module load time.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Non-embedded standard-14 fonts (e.g. Helvetica) need pdfjs's bundled font
  // data. Resolve the dir from the installed package. Use createRequire against
  // this file rather than the bare `require` — in the bundled Electron main the
  // bundler replaces `require`, so `require.resolve` misresolves and the fonts
  // silently fail to load (every glyph renders blank). If resolution or the
  // directory is missing, PDFs with embedded fonts (most real invoices) still
  // render, so this is best-effort.
  let standardFontDataUrl: string | undefined;
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(__filename);
    const fontsDir =
      path.join(path.dirname(req.resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;
    if (fs.existsSync(fontsDir)) {
      standardFontDataUrl = fontsDir;
    } else {
      console.warn(`[pdf] standard_fonts dir not found at ${fontsDir}; non-embedded fonts may not render`);
    }
  } catch (err) {
    console.warn("[pdf] could not resolve pdfjs standard_fonts dir", err);
  }

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    ...(standardFontDataUrl !== undefined ? { standardFontDataUrl } : {}),
  });
  const pdfDocument = await loadingTask.promise;

  try {
    if (pdfDocument.numPages === 0) {
      throw new Error("PDF has no pages");
    }

    const page = await pdfDocument.getPage(1);

    // Render at 2x scale for better LLM accuracy
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    const { createCanvas } = canvasMod;
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
