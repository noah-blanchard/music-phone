import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * Flat ESLint config for the whole monorepo.
 *
 * The react-hooks rules are the point of this file: the codebase carries
 * `eslint-disable-next-line react-hooks/exhaustive-deps` comments that nothing
 * was enforcing, and stale-closure bugs in effect dependencies are a real
 * source of defects here (see the round-intro timers). `exhaustive-deps` is an
 * error, not a warning — suppressions must be deliberate and justified.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/*.d.ts",
      "bun.lock",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    // A suppression that no longer suppresses anything is a lie about the code.
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      // Unused vars are errors, but allow the `_foo` convention for
      // deliberately-ignored positional params (common in the mode contracts).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      // `!!value` is the idiomatic boolean cast and reads fine; the rule is
      // here for the genuinely obscure coercions (`+x`, `"" + x`).
      "no-implicit-coercion": ["error", { allow: ["!!"] }],
      "prefer-const": "error",
      "object-shorthand": "error",
    },
  },

  // The server logs to stdout by design — that is its observability story.
  {
    files: ["apps/server/**/*.ts"],
    rules: { "no-console": "off" },
  },

  // React client code.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Test files may reach for `any` and console freely.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
);
