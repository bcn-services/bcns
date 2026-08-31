import type { Config } from "tailwindcss";
import preset from "@nseluga/config/tailwind";

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
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        pop: "pop 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "draw-rule": "draw-rule 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
} satisfies Config;
