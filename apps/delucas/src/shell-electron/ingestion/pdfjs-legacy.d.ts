/**
 * Type shim for pdfjs-dist's legacy (Node) build subpath. It exposes the same
 * API surface as the package's main entry, which ships the type declarations.
 */
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
