import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared package is shipped as TypeScript source and must be transpiled
  // by Next. The server package is only ever imported with `import type`, so it
  // never reaches the bundle and does not need transpiling.
  transpilePackages: ["@musicphone/shared"],
  reactStrictMode: true,

  // Emit .next/standalone: a self-contained server plus only the traced files it
  // needs, so the runtime image can drop node_modules entirely.
  output: "standalone",

  // Tracing defaults to this app's directory, which would leave
  // @musicphone/shared — a workspace symlink two levels up — out of the bundle.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
};

export default nextConfig;
