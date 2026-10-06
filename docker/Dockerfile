# G2: pin exact versions. G3 fallback: swap base to node:22-slim + Hono node adapter (docs/archive/runbooks/node-fallback.md)
FROM oven/bun:1.3.11 AS base
WORKDIR /app
# Manifests first, sources after: code edits must not bust the install layer cache.
# Every workspace manifest the lockfile knows must be present, or frozen install refuses
# (console ships no code into this image — its package.json only satisfies the workspace set).
COPY package.json bun.lock ./
COPY apps/console/package.json ./apps/console/package.json
COPY apps/www/package.json ./apps/www/package.json
COPY packages/channels/package.json ./packages/channels/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/harness/package.json ./packages/harness/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/worker/package.json ./services/worker/package.json
RUN bun install --frozen-lockfile --production
COPY packages ./packages
COPY services/worker ./services/worker
# The commit this image is built from (CI passes github.sha): its label, and RELEASE, which GET /release shows. Last,
# so a new commit rebuilds only these layers. Built without it, the label is empty and /release says "unknown".
ARG RELEASE=""
LABEL org.opencontainers.image.revision=$RELEASE
ENV RELEASE=$RELEASE
USER bun
EXPOSE 8080
# Healthy only while GET /ready answers ready: the worker reaches its database and its job queue. It sends the
# container's own READY_TOKEN, so a container started without one is never healthy (/ready then refuses everyone).
# Bun's fetch, as the image has no curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/ready', { headers: { authorization: 'Bearer ' + process.env.READY_TOKEN }, signal: AbortSignal.timeout(4000) }).catch(() => null); process.exit(r?.ok ? 0 : 1)"]
CMD ["bun", "services/worker/src/index.ts"]
