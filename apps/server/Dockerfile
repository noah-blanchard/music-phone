# Game server image. Render's Node runtime has no Bun binary, and the server is
# run straight from TypeScript by Bun, so it ships as a container instead.
FROM oven/bun:1.3.13-alpine

WORKDIR /app

# Manifests first so a source-only change reuses the installed layer. Every
# workspace manifest has to be here or the lockfile will not match.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# @musicphone/shared is consumed as TypeScript source, so it is copied whole
# rather than built.
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY tsconfig.base.json ./

ENV NODE_ENV=production
EXPOSE 3001

USER bun
CMD ["bun", "run", "apps/server/src/index.ts"]
