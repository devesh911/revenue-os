# Runbook: node-fallback
G3 rehearsal (do once in P2): 1) Dockerfile base -> node:22-slim 2) entrypoint -> @hono/node-server serve(app) 3) bun install -> npm ci in image 4) deploy staging, run smoke. Target: under one day.
