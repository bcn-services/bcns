import type { Config } from "tailwindcss";
import preset from "@bcn-services/config/tailwind";

export default {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    // Include the shared UI package so its Tailwind classes are generated.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
