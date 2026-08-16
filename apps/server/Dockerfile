# Game server image. The server is run straight from TypeScript by Bun, so it
# ships as a container rather than relying on a host that happens to have Bun.
# Built from the repo root: @musicphone/shared is reached through the Bun
# workspace symlink and a context of apps/server alone could not resolve it.
FROM oven/bun:1.3.13-alpine

WORKDIR /app

# Manifests first so a source-only change reuses the installed layer. Every
# workspace manifest has to be here or the lockfile will not match.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# --filter keeps the web app's dependencies (Next, React, Tone.js) out of a
# server image that never loads them.
RUN bun install --frozen-lockfile --filter '@musicphone/server' --filter '@musicphone/shared'

# @musicphone/shared is consumed as TypeScript source, so it is copied whole
# rather than built.
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY tsconfig.base.json ./

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health >/dev/null 2>&1 || exit 1

USER bun
CMD ["bun", "run", "apps/server/src/index.ts"]
