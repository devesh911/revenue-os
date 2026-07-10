-- 013 — Supabase database-linter hardening (advisors run 2026-07-11; see lessons.md)
-- ① auth_rls_initplan (PERF): wrap per-row-stable calls in scalar subselects so the planner
--    evaluates them once per statement instead of once per row. Semantics unchanged —
--    auth.uid() and request.org_id are constant within a statement.
-- ② function_search_path_mutable (SEC): pin search_path on the two flagged app functions.
--    Their bodies are fully schema-qualified or builtin, so '' is safe; member_role,
--    user_orgs, and handle_new_user already pin theirs (D31 discipline, now completed).

-- note: the linter requires current_setting() to be the subselect's immediate target
-- (nullif OUTSIDE the wrap) — both shapes initplan, only this one satisfies lint 0003.
alter policy sel on profiles using (
  id = (select auth.uid())
  or nullif((select current_setting('request.org_id', true)), '') is not null
);

alter policy ins on profiles with check (id = (select auth.uid()));

alter policy upd on profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter function app.current_org_id() set search_path = '';
alter function app.is_member(uuid, app.org_role) set search_path = '';
