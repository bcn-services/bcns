import type { ToolId } from "@/lib/content";

/** Tool colors as CSS values (for SVG attributes / inline style) and as literal Tailwind classes (JIT needs the full names). */
export const TOOL_COLOR: Record<ToolId, string> = {
  shopify: "hsl(var(--tool-shopify))",
  square: "hsl(var(--tool-square))",
  quickbooks: "hsl(var(--tool-quickbooks))",
  calendar: "hsl(var(--tool-calendar))",
  gmail: "hsl(var(--tool-gmail))",
};

export const TOOL_BG: Record<ToolId, string> = {
  shopify: "bg-tool-shopify",
  square: "bg-tool-square",
  quickbooks: "bg-tool-quickbooks",
  calendar: "bg-tool-calendar",
  gmail: "bg-tool-gmail",
};

export const TOOL_FILL: Record<ToolId, string> = {
  shopify: "fill-tool-shopify",
  square: "fill-tool-square",
  quickbooks: "fill-tool-quickbooks",
  calendar: "fill-tool-calendar",
  gmail: "fill-tool-gmail",
};
