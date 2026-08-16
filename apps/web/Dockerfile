# Web app image. Built from the repo root: @musicphone/shared ships as
# TypeScript source and is reached through the Bun workspace symlink, so a
# context of apps/web alone could not resolve it.
FROM oven/bun:1.3.13-alpine AS build

WORKDIR /repo

# Manifests first so a source-only change reuses the installed layer. Every
# workspace manifest has to be here or the lockfile will not match.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# `next build` type-checks and lints, so it needs the ESLint config and the
# server package — apps/web/src/lib/eden.ts imports its App type to type the
# Eden client (types only; no server code reaches the bundle).
COPY tsconfig.base.json eslint.config.mjs ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web

# Inlined into the client bundle at build time, which is why it is an argument
# rather than an environment variable: setting it at run time would be too late.
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` would fail on this anyway, but only after a couple of minutes and
# as a prerender stack trace. Say it plainly instead, and name the setting —
# Dokploy passes *Build-Time Arguments* to a Dockerfile build, not the
# environment variables next to them, and the two are easy to confuse.
RUN if [ -z "$NEXT_PUBLIC_SERVER_URL" ]; then \
      echo "NEXT_PUBLIC_SERVER_URL is empty."; \
      echo "It is baked into the bundle at build time, so it must be a BUILD ARGUMENT."; \
      echo "  docker build --build-arg NEXT_PUBLIC_SERVER_URL=https://api.example.com ..."; \
      echo "  Dokploy: Environment tab -> Build-Time Arguments (not Environment variables)"; \
      exit 1; \
    fi

RUN cd apps/web && bun run build

# Node, not Bun: `server.js` is Next's own output and Node is what it targets.
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone keeps the monorepo's shape, so the entrypoint lands at
# apps/web/server.js with node_modules hoisted alongside it. Static assets are
# not traced and have to be copied in beside it.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "apps/web/server.js"]
