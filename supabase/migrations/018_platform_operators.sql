-- 018 — our operator list: our own people, the only ones who may create a company. Accounts are invite-only
-- (ROADMAP.md, Slice 1): a signed-in person not on this list is refused by POST /orgs before anything else
-- happens (services/worker/src/routes/orgs.ts). The name is platform_operators, because "operator" is already a
-- role inside one company (app.org_role). It lists our people, not a company's data, so it has no org_id
-- (STATE.md → Decisions in force).
-- Rows are added by hand only: the local seed adds the dev login (scripts/dev-login.ts); on the test server
-- Devesh adds people in Supabase's SQL editor (STATE.md → Waiting on Devesh).
create table platform_operators (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Row-level security on and no policy: no API role reads or writes a row. Migration 010's default grants gave
-- app_service every new table, and Supabase's gave its own roles theirs; both are taken back. The worker asks
-- only through app.is_platform_operator below.
alter table platform_operators enable row level security;
revoke all on table platform_operators from anon, authenticated, service_role, app_service;

-- Is this person on our operator list? It answers that one question and returns nothing else, so the worker can
-- ask without reading the table. search_path is pinned to '' and every name is schema-qualified (migration 013).
create or replace function app.is_platform_operator(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_operators where user_id = p_user)
$$;

-- Default-privilege grants in schema app reach public, anon and authenticated (migrations 002 and 010): who our
-- operators are is not theirs to ask. Only the worker's role executes this.
revoke all on function app.is_platform_operator(uuid) from public, anon, authenticated, service_role;
grant execute on function app.is_platform_operator(uuid) to app_service;
