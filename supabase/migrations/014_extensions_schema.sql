-- 014 — move vector + pg_trgm out of `public` into `extensions` (advisors: extension_in_public;
-- STATE.md decision, executed while NO cloud project exists so this is two ALTERs, not surgery).
-- Both extensions are relocatable (pg_extension.extrelocatable = t, verified locally). Existing
-- objects — companies_name_trgm (gin_trgm_ops), memories.embedding / knowledge_chunks.embedding
-- (vector(1536)) — bind by OID and are unaffected. pgcrypto already lives in `extensions`
-- (Supabase preinstall; 000's bare `create extension` no-op'd onto it).

create schema if not exists extensions;

alter extension vector  set schema extensions;
alter extension pg_trgm set schema extensions;

-- The runtime role reaches the moved operators/types unqualified via its search_path
-- (existing query code and future app SQL never schema-qualify; test-pinned).
grant usage on schema extensions to app_service;
alter role app_service set search_path = public, extensions;

-- Future MIGRATION DDL (runs as postgres, default search_path) must schema-qualify:
-- `extensions.vector(1536)`, `using gin (name extensions.gin_trgm_ops)`.
