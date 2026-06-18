/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared package is shipped as TypeScript source and must be transpiled
  // by Next. The server package is only ever imported with `import type`, so it
  // never reaches the bundle and does not need transpiling.
  transpilePackages: ["@musicphone/shared"],
  reactStrictMode: true,
};

export default nextConfig;
