import { base } from "@bcn-services/config/eslint/base";

export default [
  ...base,
  {
    ignores: ["node_modules/**", "dist/**"],
  },
];
