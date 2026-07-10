# G2: pin exact versions. G3 fallback: swap base to node:22-slim + Hono node adapter (docs/runbooks/node-fallback.md)
FROM oven/bun:PIN_ME AS base
WORKDIR /app
COPY package.json bun.lock ./
COPY packages ./packages
COPY services/worker ./services/worker
RUN bun install --frozen-lockfile --production
USER bun
EXPOSE 8080
CMD ["bun", "services/worker/src/index.ts"]
