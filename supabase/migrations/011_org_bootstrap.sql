-- Task 4 — org bootstrap plumbing.

-- Profiles auto-create on signup (supabase-idiomatic trigger; keeps the profiles ins policy
-- tight — nobody but the user/trigger ever creates profile rows).
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Identity-scoped org listing for the backend: login → org switcher happens BEFORE any org
-- context exists, so org-scoped RLS rightly cannot serve it. SECURITY DEFINER with a deliberately
-- narrow surface: app_service only; the worker passes a jose-verified user id (S1.5).
create or replace function app.user_orgs(p_user uuid)
returns table (org_id uuid, role app.org_role, name text, slug text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.org_id, m.role, o.name, o.slug, m.expires_at
  from org_members m
  join orgs o on o.id = m.org_id
  where m.user_id = p_user
    and (m.expires_at is null or m.expires_at > now())
$$;

revoke execute on function app.user_orgs(uuid) from public, anon, authenticated, service_role;
grant execute on function app.user_orgs(uuid) to app_service;
