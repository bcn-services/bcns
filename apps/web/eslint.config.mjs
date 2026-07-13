import { next } from "@bcns/config/eslint/next";

export default [
  ...next,
  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts"],
  },
];
