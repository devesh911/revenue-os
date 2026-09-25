# D33 — db-design aligned with execution-proven truth (DRAFT — awaiting Devesh's merge per dev-workflow §13)

**Status:** Draft, from the 2026-07-10 P0 shakedown. Consumes the task-2 and task-8 lessons.md entries. Not law until merged.
**Affected law-docs (edited in this PR):** db-design.md (header, §4, §5, §6, §8) · project-spec.md (§5 P0 row, §12.2) · supabase/migrations/README.md.
**Companion:** D31 (app_service role bootstrap, drafted in PR #4) is referenced where its decision touches §4; it is not restated here.

## Context

Task 2 executed db-design end-to-end for the first time; task 8 exercised its upsert contract.
The DDL was not replayable as written — every deviation below was implemented, verified
(`supabase db reset` clean · `bun run rls:check` green · cross-tenant denial suite passing), and
logged in lessons.md. The law still shows the pre-execution text, so every future reader — human
or agent, copying "verbatim" as instructed — re-hits the same landmines. Per §13: a doc that
fails when executed is a doc bug. Separately, the migration span was stated three conflicting
ways (spec §5/§12: "000–007, §3–8" · migrations README: "§3–§8 + §14" · reality: 000–009
including §13's `008_prospect_candidates.sql`).

## Decision

Record the implemented, verified shape in the law:

1. **Numbering truth** (db-design header + README + spec §5/§12.2): baseline `000`–`009` spans
   **§3–§8 + §13 + §14**, one file per `-- NNN_name.sql` marker; `010`+ extend the baseline and
   are annotated inline where they amend it.
2. **§4 policy pattern is illustrative, not positional**: policies live in the same migration as
   their tables; `002` carries only helpers, grants, and `001`'s tables' policies (the template
   as written targeted `contacts`, which doesn't exist until `003`).
3. **§4 grants block**: `USAGE` on schema `app` + `EXECUTE` on its functions (+ default
   privileges) for `anon`/`authenticated`/`service_role` — policy expressions run as the
   querying role and fail with "permission denied for schema app" without it. `app_service`
   receives the same, plus DML on `public`, via migration 010 (D31).
4. **§4 write-role mapping locked** (was open: "adjusting the write role"): entities =
   `operator` · org configuration = `admin` · append-only = `sel`+`ins` only · global template
   rows (`org_id is null`) readable by members, writable by nobody via RLS.
5. **`current_org_id()` is SECURITY DEFINER** (migration 010, D31): it reads `auth.jwt()`, and
   the managed `postgres` role cannot grant auth-schema usage to custom roles.
6. **§5 companies index split**: `btree(org_id)` + `gin(name gin_trgm_ops)` — composite GIN over
   a uuid column fails on replay (42704) without `btree_gin`, which S2.7's extension allowlist
   deliberately excludes.
7. **§6 `provider_ref` partial unique index** (migration 012): the out-of-order webhook upsert
   contract ("upsert by provider_ref") requires a uniqueness guarantee, not a plain index.
8. **§8 org-resolution rule**: webhook receivers resolve `org_id` BEFORE insert — under
   org-scoped RLS, NULL-org rows are unreachable (select and insert) for the RLS-bound backend,
   so "resolve later" rows are dead letters. Vapi interim: org id rides the per-assistant server
   URL + shared secret (S6.2); the assistant-id→org mapping is a task-8 spike exit criterion.

## Alternatives rejected

- **Leave the law as-is, rely on lessons.md:** drift compounds; "copy verbatim" instructions
  reproduce proven failures in every fresh environment.
- **Amend S2.7 to allow `btree_gin`** and keep the composite GIN: widens the extension surface
  for zero measurable query benefit at V1 scale.
- **Make `webhook_events.org_id` NOT NULL:** blocks future providers whose org resolution is
  legitimately deferred at signature time; the resolve-before-insert rule does the work without
  a DDL change.

## Consequences

- db-design becomes replay-accurate; new verticals and fresh environments copy working SQL.
- Applied baseline migrations stay untouched (dev-workflow §7); the doc shows end-state with
  per-migration annotations (010, 012) naming where each amendment landed.
- The annotations describe migrations that live in the open PR stack (#3, #4, #9) — merge those
  bottom-up first or together with this.

## Reversal trigger

None — this ADR records verified reality. Individual items reopen on their own triggers (e.g.,
`btree_gin` reconsidered only against a measured composite-index need).
