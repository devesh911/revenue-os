-- db-design §3 — verbatim
create extension if not exists pgcrypto;      -- gen_random_uuid
create extension if not exists vector;        -- pgvector (embeddings)
create extension if not exists pg_trgm;       -- fuzzy search on names/companies

create schema if not exists app;              -- helper functions live here, not public
