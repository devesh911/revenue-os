# G2: pin exact versions. G3 fallback: swap base to node:22-slim + Hono node adapter (docs/runbooks/node-fallback.md)
FROM oven/bun:1.3.11 AS base
WORKDIR /app
# Manifests first, sources after: code edits must not bust the install layer cache.
# Every workspace manifest the lockfile knows must be present, or frozen install refuses
# (console ships no code into this image — its package.json only satisfies the workspace set).
COPY package.json bun.lock ./
COPY apps/console/package.json ./apps/console/package.json
COPY packages/channels/package.json ./packages/channels/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/harness/package.json ./packages/harness/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/worker/package.json ./services/worker/package.json
RUN bun install --frozen-lockfile --production
COPY packages ./packages
COPY services/worker ./services/worker
USER bun
EXPOSE 8080
CMD ["bun", "services/worker/src/index.ts"]
