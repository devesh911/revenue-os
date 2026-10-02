# When a migration fails on the cloud test database

`staging-migrations` (.github/workflows/staging-migrations.yml) applies main's migrations to the cloud test database
(staging) once `checks` has passed on the commit. A migration can pass every test, which start from an empty
database, and still fail on staging, which holds rows the tests never made. For example, `018_unique_phone.sql` makes
contacts' phone numbers unique, and staging has two contacts with the same number.

## How you know it is this
- The staging-migrations run on main is red at "Apply migrations to staging", and its summary points here. Its log
  names the migration that failed and Postgres's error.
- Every later run on main fails the same way. Each one sees that the cloud lacks that migration and tries it again,
  and `supabase db push` stops at the first migration that fails, so every newer migration waits behind it.

## Why no agent can fix it alone
- CI refuses any change to a migration already on main (`rules-from-main`, AGENTS.md hard rail 4), even one the cloud
  never ran: CI can't see the cloud, and every local database and test already ran the migration as written.
- Agents' own tools refuse every command that reaches the cloud database, `supabase migration repair` included
  (scripts/done-gate/tools.ts).

## What to do
Pick the case that fits the error.

**A. Staging's rows are the problem; the migration is right.**
1. Supabase dashboard → the staging project (ajtfillmkjhoffxllqja) → SQL Editor: fix the rows the error names. In
   the example, merge or delete the duplicate contacts.
2. GitHub → Actions → staging-migrations → Run workflow, on main. The run logs "Applying: … lacks 018" and goes green.

**B. The migration is wrong for staging; the fix belongs in code.**
1. Ask an agent for a new migration with the next free number that does what the broken one meant to do, written to
   work whether or not the broken one ran (`if not exists`, `drop … if exists`): every local database ran it, staging
   never did. Look in the SQL Editor for anything the broken one left behind on staging, and tell the agent. The new
   migration merges like any other pull request; its staging run still fails at the broken one.
2. In your own terminal, in the main checkout, record the broken migration as applied on staging without running it:
   `supabase link --project-ref ajtfillmkjhoffxllqja` (it asks for staging's database password), then
   `supabase migration repair --status applied 018` (the broken migration's number), then `supabase unlink`, so no
   later command in that checkout can reach the cloud.
3. Run the workflow by hand as in A.2. The run logs "Applying: … lacks 019" and goes green.

Never edit, rename or delete the broken migration on main, and never use docs/runbooks/rules-check-way-back.md to
force such a change through: that page is for a rule that misfires, and this rule is right.
