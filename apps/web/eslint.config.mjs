import { next } from "@acme-labs/config/eslint/next";

export default [
  ...next,
  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts"],
  },
];
