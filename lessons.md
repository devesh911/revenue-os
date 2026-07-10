# Lessons — append-only field notes
(Format: date · task · finding · suggested doc change)

- 2026-07-10 · task 2 · `supabase/migrations/README.md` says "copy db-design §3–§8 + §14" but the
  numbering 000–009 only works with §13 included (db-design itself names `008_prospect_candidates.sql`).
  → Suggested: README should read "§3–§8 + §13 + §14".
- 2026-07-10 · task 2 · db-design §4 shows the RLS policy template under `002_rls.sql` targeting
  `contacts`, which doesn't exist until 003 — the template can't execute at position 002. Implemented:
  002 = helpers + policies for 001's tables; every later migration carries its own tables' policies.
  → Suggested: db-design §4 note that the template is illustrative and policies live with their tables.
- 2026-07-10 · task 2 · db-design leaves per-table write roles open ("adjusting the write role").
  Implemented with Devesh's approval: entities (contacts/companies/deals/appointments/tasks/
  conversations/memories/KB) = operator; org config (pipelines/stages/dispositions/field_definitions/
  guardrails/integrations/api_keys/agents/workflows/campaigns/eval_scenarios) = admin; append-only
  tables = sel+ins only; global-template rows (org_id NULL) readable by members, unwritable via RLS.
  → Suggested: record the mapping in db-design §4.
- 2026-07-10 · task 2 · `webhook_events.org_id` is "nullable until resolved" but org-scoped RLS makes
  NULL-org rows unreachable (insert and select) for the RLS-bound backend. Receivers must resolve
  org_id BEFORE insert. → Suggested: make org resolution a task-8 Vapi-spike exit criterion (or amend
  db-design/security with the sanctioned NULL-org access path).
- 2026-07-10 · task 2 · db-design §5's `create index companies_org_name on companies using gin
  (org_id, name gin_trgm_ops)` fails on replay: `ERROR: data type uuid has no default operator class
  for access method "gin" (42704)`. Composite GIN with uuid needs `btree_gin`, which S2.7's extension
  allowlist (pgcrypto/vector/pg_trgm only) excludes. Implemented: split into btree(org_id) +
  gin(name gin_trgm_ops). → Suggested: amend db-design §5 (or S2.7, if btree_gin is wanted).
- 2026-07-10 · task 2 · RLS policies call `app.is_member()` but db-design never grants USAGE on
  schema `app` — every query as `authenticated`/`anon` fails with `permission denied for schema app`
  (verified against the local stack). Implemented: grants in 002_rls.sql (+ default privileges).
  → Suggested: add the grants block to db-design §4; include the future `app_service` role in it (task 3).
- 2026-07-10 · task 2 · `app.current_org_id()` references `auth.jwt()`, so any custom RLS-bound role
  (the future `app_service`) needs USAGE on schema `auth` — which only `supabase_admin` can grant (the
  managed `postgres` role warns "no privileges were granted"). Alternative verified to work: make
  `current_org_id()` SECURITY DEFINER (as `member_role` already is). → Decision needed in task 3:
  definer flag vs auth-schema grant. Isolation itself verified: cross-tenant SELECT returns 0 rows;
  cross-tenant INSERT fails with "new row violates row-level security policy".
- 2026-07-10 · task 2 · db-design §1 mandates the `app_service` role but no migration creates it, and
  its password can't live in SQL anyway. Role creation + grants need a decided home before task 3
  (packages/db client). → Suggested: an ADR on role bootstrap per environment.
- 2026-07-10 · task 8 · The CLAUDE.md gotcha "upsert by provider_ref" needs a uniqueness guarantee
  db-design §6 doesn't have (convo_provider is a plain index). Added partial unique index
  (012_conversations_provider_ref.sql). → Suggested: amend db-design §6. Also: interim org
  resolution for Vapi webhooks = org id in the per-assistant server URL + shared secret; final
  assistant-id mapping is a spike exit criterion (S6.2) — REAL payloads must replace the synthetic
  fixtures during the spike (needs VAPI_API_KEY, Devesh).
- 2026-07-10 · CI · The scaffold's compact-YAML workflows were unparseable (`${{ }}` inside flow
  maps) — GitHub recorded "workflow file issue" failures on every push and NO job ever ran; local
  gates masked it. Fixed: block YAML + test-env export step + `supabase init` fallback + CLI pinned
  2.109.1 (unpinned runner CLI rejected v2.109 config keys). → Suggested: S13.7 corollary for the
  docs — "a red/absent check is a stop signal; verify the pipeline RAN, not just that code passed
  locally"; and G2 explicitly covers the supabase CLI version.
- 2026-07-10 · CI · gitleaks (once actually running) caught a real near-miss: a `git add -A` format
  commit on feat/task-03 committed `apps/console/.env.local` because that branch's .gitignore
  predates the `.env.local` line. Contents = the LOCAL demo anon key (designed-public, S7.3) —
  no real exposure. Removed + path allowlisted in .gitleaks.toml with justification (history
  rewrite would need force-push, which protocol forbids). → Suggested S-control: ignore rules for
  env-file patterns belong in the FIRST commit of a repo, and `git add -A` is banned in fix
  commits touching branches with older .gitignore snapshots.
