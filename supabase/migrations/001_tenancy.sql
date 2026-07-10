-- db-design §4 — verbatim (RLS policies for these tables live in 002_rls.sql,
-- after the app.* helper functions they depend on exist)
create type app.org_role as enum ('admin','operator','viewer');

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  vertical    text not null default 'generic',       -- 'real_estate' | 'b2b_wholesale' | ...
  settings    jsonb not null default '{}',           -- timezone, locale defaults, branding
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Mirrors auth.users (Supabase); app-facing profile data
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  locale      text not null default 'en-IN',
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        app.org_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  key_hash    text not null unique,                  -- sha256; plaintext shown once
  scopes      text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Append-only. Doubles as the agent action trace (observability spine).
create type app.actor_type as enum ('user','agent','system','integration');

create table audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references orgs(id),
  actor_type    app.actor_type not null,
  actor_id      text,                                -- user uuid | agent key | integration key
  action        text not null,                       -- 'contact.update', 'call.place', 'tool.book_appointment'
  resource_type text,
  resource_id   text,
  before        jsonb,
  after         jsonb,
  meta          jsonb not null default '{}',         -- ip, request id, workflow_run_id, model, latency
  created_at    timestamptz not null default now()
);
create index audit_org_time on audit_log (org_id, created_at desc);
create index audit_resource on audit_log (org_id, resource_type, resource_id);
