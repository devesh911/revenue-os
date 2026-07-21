# Secrets & config map — every variable, by NAME, and where it lives

Names and locations only — **values never appear in this repo, in chat, or in logs** (hard rail 1).
The password manager (1Password/Bitwarden) is the source of truth for values;
`scripts/provision-staging.sh` generates and installs the staging trio. Rotation cadence:
`runbooks/rotation.md`.

**Maintenance rule:** any PR that adds a `process.env.*` / `import.meta.env.*` reference, a
`secrets.*` use in a workflow, or a new Cloudflare/GitHub setting adds a row here. That's the
whole tracking system — one table, reviewed by eye.

## 1 · The five stores (plus the password manager above them all)

| Store | Holds | Who reads it |
|---|---|---|
| VPS `~/app/.env` (mode 0600) | worker runtime secrets | worker + Caddy containers via compose `env_file` |
| GitHub Environment `staging` | CI deploy credentials | `deploy.yml` jobs only |
| Cloudflare Pages build env | `VITE_*` (public by design) | console build, prod + preview |
| Cloudflare Transform Rule | the `X-Edge-Auth` header value | injected into every `api.<domain>` request |
| Local root `.env` (gitignored) | local dev copies | local worker/tests/scripts |

Supabase Vault is reserved for future per-tenant credentials (S5); nothing lives there yet.

## 2 · Live variables (referenced in code/config today)

| Name | Secret? | Read by (file) | Set in |
|---|---|---|---|
| `DATABASE_URL` | **yes** | worker boot gate `services/worker/src/env.ts` · `packages/harness/demo-harness.ts` · db/worker tests | VPS `.env` · local `.env` · CI test-env (local Supabase string) |
| `SUPABASE_URL` | no (public URL) | `services/worker/src/env.ts` | VPS `.env` · local · CI |
| `CORS_ORIGINS` | no | `services/worker/src/env.ts` (default `http://localhost:5173`) | VPS `.env` (`https://console.<domain>`) |
| `VAPI_WEBHOOK_SECRET` | **yes** | `services/worker/src/vapi/receive.ts:27` · `scripts/spike-vapi.ts` | VPS `.env` **and** Vapi assistant `server.secret` — same value, rotate together (Vapi never echoes it back; see STATE DECISIONS) |
| `EDGE_SHARED_SECRET` | **yes** | Caddy via `docker/docker-compose.yml` → `Caddyfile` header check | VPS `.env` **and** Cloudflare Transform Rule — same value, rotate together |
| `VITE_SUPABASE_URL` | no | console build → `apps/console/src/lib/env.ts` | Cloudflare Pages build env · `apps/console/.env` local |
| `VITE_SUPABASE_ANON_KEY` | no — **designed-public** (S7.3); RLS is the guard, not this key | console build → `env.ts`/`supabase.ts` | Cloudflare Pages · local |
| `VITE_API_URL` | no | `apps/console/src/lib/api.ts` (default `http://localhost:8080`) | Cloudflare Pages · local |
| `SUPABASE_ACCESS_TOKEN` | **yes** | `deploy.yml` staging-migrations | GitHub Environment `staging` |
| `SUPABASE_DB_PASSWORD` | **yes** | `deploy.yml` staging-migrations | GitHub Environment `staging` |
| `GITHUB_TOKEN` | auto-issued per run | `ci.yml` (gitleaks) | GitHub, automatic — never stored |
| `LOCAL_DB_URL` | no (local-only string) | tests · `scripts/seed.ts` | local `.env` · CI test-env |
| `SUPABASE_ANON_KEY` | no (designed-public) | worker/db **tests only** | local `.env` · CI test-env |
| `VAPI_API_KEY` | **yes** | `scripts/spike-vapi.ts` **only** — not worker runtime | local `.env` only |
| `STAGING_SSH_KEY` | **yes** | nothing yet — task-14b will use it | GitHub Environment `staging` (pending; see STATE WAITING) |

Build-time vs runtime, because it explains where things go: `VITE_*` values are **baked into
the JS bundle at build time** on Cloudflare's builders (that's why they live in Pages settings
and why changing them requires a redeploy, and why they must never be actual secrets). Worker
vars are **read at boot on the VPS** — change `.env`, `docker compose up -d`, done.

## 3 · Reserved names (documented in `.env.example`, used NOWHERE in code yet)

`META_WA_TOKEN` · `META_APP_SECRET` · `GOOGLE_OAUTH_CLIENT_ID` · `GOOGLE_OAUTH_CLIENT_SECRET`
· `SENTRY_DSN` · `POSTHOG_KEY` — placeholders for the channels package (P2) and observability
wiring. If you're hunting a config bug, these six are never the answer. Move a name up to §2
the day code first reads it.

## 4 · Known drift (found 2026-07-21; candidates for small fix PRs)

1. `VAPI_WEBHOOK_SECRET` is read straight from `process.env` at request time
   (`vapi/receive.ts:27`) instead of through the `env.ts` Zod boot gate — a worker missing it
   boots "healthy" and fails on the first webhook. Fix: add it to `EnvSchema`.
2. `SUPABASE_ANON_KEY` is consumed by worker tests but absent from the worker's runtime env
   contract — harmless, but the test env and `env.ts` no longer describe the same world.
3. `VAPI_API_KEY` looks like worker config but is spike-script-only; keep it local, never on
   the VPS.
