-- db-design §5 — verbatim DDL, then RLS per §4 template (entities=operator, config=admin)
create type app.lifecycle_stage as enum
  ('new','contacted','qualified','meeting_scheduled','opportunity','customer','lost','dnc');

create table companies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  domain      text,
  attributes  jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
-- Deviation from db-design §5 (documented in lessons.md): the doc's composite
-- `gin (org_id, name gin_trgm_ops)` fails — uuid has no GIN opclass without btree_gin,
-- which the S2.7 extension allowlist excludes. Split instead:
create index companies_org on companies (org_id);
create index companies_name_trgm on companies using gin (name gin_trgm_ops);

create table contacts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  company_id         uuid references companies(id),
  first_name         text,
  last_name          text,
  preferred_language text not null default 'en',        -- 'en' | 'hi' | 'hi-en' (Hinglish)
  timezone           text not null default 'Asia/Kolkata',
  lifecycle_stage    app.lifecycle_stage not null default 'new',
  source             text,                              -- 'csv_import' | 'meta_leads' | 'portal' | 'manual'
  owner_user_id      uuid references profiles(id),
  consent            jsonb not null default '{"dnc": false, "whatsapp_optin": null, "recording_consent": null}',
  attributes         jsonb not null default '{}',       -- vertical-specific custom fields
  score              numeric(6,2),                      -- denormalized cache of latest contact_scores row
  score_updated_at   timestamptz,
  last_interaction_at timestamptz,
  merged_into_id     uuid references contacts(id),      -- dedupe: set when merged; row kept for audit
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index contacts_org_stage on contacts (org_id, lifecycle_stage) where deleted_at is null;
create index contacts_org_score on contacts (org_id, score desc nulls last) where deleted_at is null;
create index contacts_org_last  on contacts (org_id, last_interaction_at desc nulls last);

-- Identity resolution: one row per phone/email/wa/external id. THE dedupe mechanism.
create type app.identity_kind as enum ('phone','email','whatsapp','external');

create table contact_identities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  kind        app.identity_kind not null,
  value       text not null,                            -- E.164 for phone; lowercased for email
  is_primary  boolean not null default false,
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (org_id, kind, value)                          -- hard uniqueness = dedupe guarantee
);
create index ci_contact on contact_identities (contact_id);

-- Pipelines: seeded per vertical template; stages are org-configurable
create table pipelines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  key         text not null,
  name        text not null,
  unique (org_id, key)
);

create table pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  key         text not null,
  name        text not null,
  position    int not null,
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  unique (pipeline_id, key)
);

create type app.deal_status as enum ('open','won','lost');

create table deals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  contact_id    uuid not null references contacts(id),
  company_id    uuid references companies(id),
  pipeline_id   uuid not null references pipelines(id),
  stage_id      uuid not null references pipeline_stages(id),
  title         text not null,
  value_amount  numeric(14,2),
  currency      char(3) not null default 'INR',
  status        app.deal_status not null default 'open',
  expected_close date,
  attributes    jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index deals_org_status on deals (org_id, status, stage_id) where deleted_at is null;

-- Typed validation for jsonb custom fields
create table field_definitions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  entity      text not null check (entity in ('contact','company','deal','appointment')),
  key         text not null,
  label       text not null,
  field_type  text not null check (field_type in ('text','number','boolean','date','enum')),
  options     jsonb,                                    -- enum choices
  required    boolean not null default false,
  unique (org_id, entity, key)
);

-- ── RLS ──

alter table companies enable row level security;
create policy sel on companies for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on companies for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on companies for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());
create policy del on companies for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

-- contacts: the doc's canonical template, verbatim
alter table contacts enable row level security;
create policy sel on contacts for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on contacts for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on contacts for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());
create policy del on contacts for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

-- contact_identities: no delete policy — rows die only via contact cascade; merges set merged_into_id
alter table contact_identities enable row level security;
create policy sel on contact_identities for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on contact_identities for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on contact_identities for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());

alter table pipelines enable row level security;
create policy sel on pipelines for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on pipelines for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on pipelines for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());
create policy del on pipelines for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

alter table pipeline_stages enable row level security;
create policy sel on pipeline_stages for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on pipeline_stages for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on pipeline_stages for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());
create policy del on pipeline_stages for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

alter table deals enable row level security;
create policy sel on deals for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on deals for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on deals for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());
create policy del on deals for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));

alter table field_definitions enable row level security;
create policy sel on field_definitions for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on field_definitions for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
create policy upd on field_definitions for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'))
  with check (org_id = app.current_org_id());
create policy del on field_definitions for delete
  using (org_id = app.current_org_id() and app.is_member(org_id, 'admin'));
