# Revenue OS

An AI sales team for high-ticket businesses, starting with Indian real-estate developers: for every
lead it decides the next best step toward a booked site visit — WhatsApp, a phone call, a wait or a
hand-off to a person — does it within the customer's rules, and learns from the outcome.

**Start here**

1. [`docs/NORTH-STAR.md`](docs/NORTH-STAR.md) — what we are building and why (one page)
2. [`STATE.md`](STATE.md) — what actually works today
3. [`ROADMAP.md`](ROADMAP.md) — what we build next, slice by slice, and what counts as done
4. [`AGENTS.md`](AGENTS.md) — how we work (rules for people and AI agents)

Tracker page (renders ROADMAP.md and STATE.md): https://claude.ai/artifact/AA8oywPgYW1VgSefP4Va2E

`docs/` holds reference material (database design, stack choices, security checklist, runbooks,
code patterns). `docs/archive/` is history from July–September 2026 and is never current.

## Local development
```sh
bun install
supabase start                 # local Postgres + Auth (Docker)
bun run db:reset               # re-apply migrations, restore the app_service login
bun run db:seed real_estate    # seed a demo company; prints the local dev login
bun run local bun run dev      # worker :8080 + console http://localhost:5173
```
Sign in with the dev login `db:seed` prints — it exists on the local stack only (accounts are
invite-only; there is no sign-up screen). `bun run local <cmd>` runs any command with the settings
read from the running local stack (Supabase URL, anon key, database URLs, ports), never printing
keys — e.g. `bun run local bun test`, `bun run local bun run e2e`. The command list is in AGENTS.md.
