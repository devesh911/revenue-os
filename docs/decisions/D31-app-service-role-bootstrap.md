# D31 — app_service role bootstrap (DRAFT — awaiting Devesh's merge per dev-workflow §13)

**Status:** Draft, written by the implementing session for task 3. Not law until merged by Devesh.

## Context
db-design §1 mandates that the backend connects as an RLS-bound `app_service` role, but no migration
created it, its password cannot live in SQL, and `app.current_org_id()` references `auth.jwt()` —
a schema the managed `postgres` role cannot grant custom roles access to (verified on the local
stack; see lessons.md 2026-07-10).

## Decision
1. Migration `010_app_service_role.sql` creates `app_service` **NOLOGIN** (idempotent) with USAGE on
   `public` + `app`, DML on all public tables, sequence usage, and matching default privileges.
2. LOGIN + password are granted **out-of-band per environment**: locally by the test bootstrap
   (`alter role app_service with login password …` with a throwaway value), on staging/prod by an
   operator step documented in the runbook. No secret ever appears in a migration.
3. `app.current_org_id()` becomes **SECURITY DEFINER** — the same pattern `app.member_role()`
   already uses — so RLS-bound roles never need auth-schema grants.

## Alternatives rejected
- Granting `usage on schema auth` to app_service: requires `supabase_admin`, unavailable to
  migrations locally; couples every future role to a platform-privileged step.
- Password in migration SQL: violates S9 outright.
- Using Supabase `service_role`: forbidden (S1.2) — bypasses RLS, defeats the moat invariant.

## Consequences
- Every environment needs the one-time LOGIN/password step before the worker can connect.
- SECURITY DEFINER functions must keep `set search_path` discipline (member_role already does;
  current_org_id is a pure builtin-call body).

## Reversal trigger
If Supabase ships first-class custom-role auth-schema grants, drop the definer flag and grant
directly.
