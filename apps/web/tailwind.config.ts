import type { Config } from "tailwindcss";
import preset from "@bcn-services/config/tailwind";

export default {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // Include the shared UI package so its Tailwind classes are generated.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Tool colors and logo-cube faces are HSL triples in globals.css; same in both themes.
      // `primary.ink` is the filled-button blue (#3b74c4 light, #7EB3F7 dark). `primary`
      // is already a {DEFAULT, foreground} object in the preset; extend merges the key.
      colors: {
        primary: { ink: "hsl(var(--primary-ink))" },
        tool: {
          shopify: "hsl(var(--tool-shopify))",
          square: "hsl(var(--tool-square))",
          quickbooks: "hsl(var(--tool-quickbooks))",
          calendar: "hsl(var(--tool-calendar))",
          gmail: "hsl(var(--tool-gmail))",
        },
        cube: {
          top: "hsl(var(--cube-top))",
          left: "hsl(var(--cube-left))",
          right: "hsl(var(--cube-right))",
        },
      },
      // The preset's `fade-up` lands with a 34px travel plus a scale, which is
      // heavier than this design language wants. Same key, retuned to the
      // artboards' 18px rise on an exponential ease-out — extend merges by key,
      // so this overrides the preset without touching packages/.
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Hairline rules that draw themselves in from the left on scroll.
        "draw-rule": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        // /work: a dot drifts along a hairline; /pricing: tier cube bobs; /about: mark sways.
        drift: {
          "0%": { left: "0", opacity: "0" },
          "8%": { opacity: "1" },
          "92%": { opacity: "1" },
          "100%": { left: "calc(100% - 9px)", opacity: "0" },
        },
        bob: { "50%": { transform: "translateY(-4px)" } },
        sway: { "50%": { transform: "translate(-10px, 14px) rotate(2deg)" } },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        pop: "pop 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "draw-rule": "draw-rule 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        drift: "drift 9s linear infinite",
        bob: "bob 7s ease-in-out infinite",
        sway: "sway 14s ease-in-out infinite",
      },
    },
  },
} satisfies Config;
