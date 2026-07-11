-- STATE.md NEXT-3 (P2) — a home for pg-boss (tech-stack T7/T26.4).
-- pgboss.* is queue plumbing: no org rows, no RLS (CLAUDE.md gotcha; rls gate scopes to public).
-- app_service gets USAGE + CREATE (not ownership — the managed migration role cannot SET ROLE
-- to a role it isn't a member of, verified 2026-07-11) so boss.start() can install and migrate
-- pg-boss's own tables at boot; app_service owns what it creates in here.
create schema if not exists pgboss;
grant usage, create on schema pgboss to app_service;
