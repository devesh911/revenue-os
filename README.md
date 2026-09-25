# Revenue OS
Voice-led agentic revenue platform. **Start here:** `docs/dev-workflow.md` (how we work) → `docs/project-spec.md` §12 (task backlog).
Docs are authoritative: project-spec · db-design · tech-stack · security · dev-workflow. Amendments happen in the strategy chat, never in-repo first.

## Local development
```sh
supabase start                 # local Postgres + Auth (Docker)
bun run db:reset               # re-apply migrations, restore the app_service login
bun run db:seed real_estate    # seed a demo org; prints the local dev login
bun run local bun run dev      # worker :8080 + console http://localhost:5173
```
Sign in with the dev login `db:seed` prints — it exists on the local stack only (accounts are invite-only; there is no sign-up screen).
`bun run local <cmd>` runs any command with the env read from the local stack (Supabase URL, anon key, database URLs, ports), never printing keys — e.g. `bun run local bun test`, `bun run local bun run e2e`.
