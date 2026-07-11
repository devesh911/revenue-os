-- Gate fails (psql exit 3 with ON_ERROR_STOP=1) if any public table lacks RLS (db-design §8 / security S1.1).
-- A bare SELECT always exits 0 no matter how many offenders it lists — that shape was verification theater.
do $$
declare
  offenders text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if offenders is not null then
    raise exception 'RLS disabled on: %', offenders;
  end if;

  raise notice 'rls_coverage: 0 offenders';
end $$;
