-- db-design §14.1 (addendum 2026-07-10, D28) — verbatim
-- Support/ops access to a tenant is an ordinary membership that expires — never an RLS bypass.
alter table org_members add column expires_at timestamptz;      -- NULL = permanent (tenant's own staff)
alter table org_members add column granted_by uuid references profiles(id);
alter table org_members add column reason text;

create or replace function app.member_role(target_org uuid) returns app.org_role
language sql stable security definer set search_path = public as $$
  select role from org_members
  where org_id = target_org
    and user_id = auth.uid()
    and (expires_at is null or expires_at > now())
$$;
