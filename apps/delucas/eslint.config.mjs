import { base } from "@bcns/config/eslint/base";

export default [
  ...base,
  {
    ignores: ["dist/**", "node_modules/**", ".tsbuildinfo/**", "out/**"],
  },
];
