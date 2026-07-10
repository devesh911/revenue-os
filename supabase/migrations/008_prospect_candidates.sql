-- db-design §13 (addendum 2026-07-07) — verbatim DDL, then RLS
create table prospect_candidates (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id) on delete cascade,
  source               text not null check (source in ('google_places','manual','import','other')),
  source_ref           text,                              -- e.g. Places place_id (idempotency key)
  company_name         text,
  contact_name         text,
  candidate_phone      text,                              -- raw; normalized to E.164 during enrichment
  city                 text,
  segment              text,                              -- 'retailer' | 'architect' | 'builder' | 'horeca'
  raw                  jsonb not null default '{}',       -- full source payload
  enrichment           jsonb not null default '{}',       -- normalized phone, website, hours, quality flags
  status               text not null default 'new' check (status in
    ('new','enriched','duplicate','approved','rejected','promoted')),
  duplicate_of_contact uuid references contacts(id),      -- set when phone matches contact_identities
  promoted_contact_id  uuid references contacts(id),      -- set on promotion
  reviewed_by          uuid references profiles(id),
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  unique (org_id, source, source_ref)
);
create index candidates_review_queue on prospect_candidates (org_id, status, created_at)
  where status in ('new','enriched');

-- ── RLS: staging entity — operators review/approve in the console; adapter writes via backend ──
alter table prospect_candidates enable row level security;
create policy sel on prospect_candidates for select
  using (org_id = app.current_org_id() and app.is_member(org_id, 'viewer'));
create policy ins on prospect_candidates for insert
  with check (org_id = app.current_org_id() and app.is_member(org_id, 'operator'));
create policy upd on prospect_candidates for update
  using (org_id = app.current_org_id() and app.is_member(org_id, 'operator'))
  with check (org_id = app.current_org_id());
