import type { Config } from "tailwindcss";
import preset from "@bcns/config/tailwind";

export default {
  presets: [preset],
  content: [
    "./src/renderer/**/*.{ts,tsx}",
    // Include shared UI package so its Tailwind classes are generated
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
