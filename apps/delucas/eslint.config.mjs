import { base } from "@nseluga/config/eslint/base";

export default [
  ...base,
  {
    ignores: ["dist/**", "node_modules/**", ".tsbuildinfo/**", "out/**"],
  },
  {
    // Test files (.mjs) use _ prefix convention for intentionally unused params.
    // The base config only applies argsIgnorePattern to .ts/.tsx; extend it here.
    files: ["**/*.mjs"],
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
