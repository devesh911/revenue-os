-- Task 3 — app_service: the RLS-bound backend role (db-design §1, S1.2/S1.3).
-- Decisions drafted in docs/decisions/D31-app-service-role-bootstrap.md (Devesh merges per §13):
--   • Role is created NOLOGIN in-migration (idempotent); LOGIN + password are set out-of-band
--     per environment (local: test bootstrap / scripts; staging/prod: operator step). No secret in SQL.
--   • current_org_id() becomes SECURITY DEFINER — it references auth.jwt(), and the managed
--     `postgres` role cannot grant auth-schema usage to custom roles (verified, lessons.md);
--     member_role() already uses the same pattern.
do $$ begin
  if not exists (select from pg_roles where rolname = 'app_service') then
    create role app_service nologin;
  end if;
end $$;

grant usage on schema public to app_service;
grant usage on schema app to app_service;
grant execute on all functions in schema app to app_service;
alter default privileges in schema app grant execute on functions to app_service;

grant select, insert, update, delete on all tables in schema public to app_service;
alter default privileges in schema public grant select, insert, update, delete on tables to app_service;
grant usage, select on all sequences in schema public to app_service;
alter default privileges in schema public grant usage, select on sequences to app_service;

alter function app.current_org_id() security definer;
