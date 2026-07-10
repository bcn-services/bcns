import nextPlugin from "@next/eslint-plugin-next";
import { base } from "./base.js";

/**
 * Flat ESLint config for Next.js apps. Adds the official @next/next plugin
 * rules (recommended + core-web-vitals) on top of the shared base.
 */
export const next = [
  ...base,
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];

export default next;
