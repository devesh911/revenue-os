-- 016 — the scheduled tick's org-discovery seam (H10, task-58).
-- The cron tick must answer "which orgs have runs due right now?" BEFORE it has an org to scope
-- to, but app_service is RLS-bound: workflow_runs' select policy is
-- `org_id = app.current_org_id() and app.is_member(org_id,'viewer')`, so an unscoped scan returns
-- zero rows and the fan-out is empty forever (jobs.ts runScheduledTick).
--
-- The exemption is scoped to the QUESTION, not to tenant data: a SECURITY DEFINER function owned
-- by postgres that returns org IDS ONLY — no row payload, no other table. app_service's own row
-- visibility is unchanged; every read it makes still goes through withOrg.
-- search_path is pinned to '' (D31 discipline, migration 013) and every reference is
-- schema-qualified (post-014 rule). The status literals coerce to app.run_status by assignment.
create or replace function app.due_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct org_id from public.workflow_runs
  where status in ('pending','waiting') and wake_at <= now()
$$;

-- Default-privilege grants in schema app reach public/anon/authenticated (002, 010): a
-- cross-tenant list of org ids is not theirs to read. Only the scheduler's role executes this.
revoke all on function app.due_org_ids() from public, anon, authenticated;
grant execute on function app.due_org_ids() to app_service;
