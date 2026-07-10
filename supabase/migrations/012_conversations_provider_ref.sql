-- Task 8 — the CLAUDE.md gotcha "Vapi webhooks arrive out of order: upsert by provider_ref"
-- requires a uniqueness guarantee db-design §6 doesn't carry (convo_provider is a plain index).
-- Partial unique index makes the upsert real; noted in lessons.md for the §13 loop.
create unique index convo_provider_ref_uq on conversations (provider, provider_ref)
  where provider_ref is not null;
