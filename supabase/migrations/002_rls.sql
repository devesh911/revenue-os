-- db-design §4 "RLS helpers + policy pattern" — helpers verbatim; then policies for the
-- 001_tenancy tables (the doc's template is applied per-table in each table's own migration,
-- since the template cannot execute before its target tables exist).
create or replace function app.current_org_id() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.org_id', true), '')::uuid,
    (auth.jwt() ->> 'org_id')::uuid
  )
$$;

create or replace function app.member_role(target_org uuid) returns app.org_role
language sql stable security definer set search_path = public as $$
  select role from org_members
  where org_id = target_org and user_id = auth.uid()
$$;

create or replace function app.is_member(target_org uuid, min_role app.org_role default 'viewer')
returns boolean language sql stable as $$
  select case
    when current_setting('request.org_id', true) = target_org::text then true  -- backend path
    when min_role = 'viewer'   then app.member_role(target_org) is not null
    when min_role = 'operator' then app.member_role(target_org) in ('operator','admin')
    when min_role = 'admin'    then app.member_role(target_org) = 'admin'
  end
$$;

-- Policy evaluation runs as the querying role: without USAGE on schema app, every policy
-- errors with "permission denied for schema app" (verified; documented in lessons.md).
grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;
alter default privileges in schema app
  grant execute on functions to anon, authenticated, service_role;

-- ── RLS: tenancy tables (roles per approved mapping: entities=operator, config=admin) ──

-- orgs: id IS the org. Insert = backend bootstrap path only (org-create flow, task 4).
alter table orgs enable row level security;
create policy sel on orgs for select using (app.is_member(id, 'viewer'));
create policy ins on orgs for insert with check (id = app.current_org_id());
create policy upd on orgs for update
  using (app.is_member(id, 'admin')) with check (app.is_member(id, 'admin'));

-- profiles: no org_id — own row for users; backend (request.org_id set) may read for
-- assignee/handoff display. Writes: own row only.
alter table profiles enable row level security;
create policy sel on profiles for select using (
  id = auth.uid() or nullif(current_setting('request.org_id', true), '') is not null
);
create policy ins on profiles for insert with check (id = auth.uid());
create policy upd on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- org_members: visible to fellow members; managed by org admins (invites, roles — task 4).
alter table org_members enable row level security;
create policy sel on org_members for select using (app.is_member(org_id, 'viewer'));
create policy ins on org_members for insert with check (app.is_member(org_id, 'admin'));
create policy upd on org_members for update
  using (app.is_member(org_id, 'admin')) with check (app.is_member(org_id, 'admin'));
create policy del on org_members for delete using (app.is_member(org_id, 'admin'));

-- api_keys: admin-only surface; revocation is an update, keys are never deleted.
alter table api_keys enable row level security;
create policy sel on api_keys for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy ins on api_keys for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on api_keys for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());

-- audit_log: append-only — sel + ins only ("insert is open to any member/service").
alter table audit_log enable row level security;
create policy sel on audit_log for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on audit_log for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
