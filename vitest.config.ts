import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Root Vitest config. Each workspace that has tests is a project, so
 * `bun run test` covers the whole repo in one pass while keeping per-package
 * roots (and therefore relative imports) intact.
 *
 * `@musicphone/shared` is aliased explicitly rather than relying on the bun
 * workspace symlink: the package ships raw TypeScript, and the alias keeps
 * resolution identical whether tests run from the repo root or a package dir.
 */
const sharedSrc = fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url));

const alias = { "@musicphone/shared": sharedSrc };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "shared",
          root: "./packages/shared",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "server",
          root: "./apps/server",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Framework-free client logic only (`.ts`, not `.tsx`) — no DOM needed.
        resolve: { alias },
        test: {
          name: "web",
          root: "./apps/web",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
  },
});
