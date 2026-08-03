-- task-60 — webhook_events is org-scoped, ephemeral lifecycle data, but 007_ops.sql created its
-- org_id FK WITHOUT `on delete cascade` — unlike EVERY org-scoped harness table in 006_harness.sql.
-- So deleting an org while a webhook_events row references it fails (23503). That surfaces the
-- moment a run's inbound webhook is retained through org teardown (demo-driver / org offboarding).
-- Align webhook_events with the established convention: cascade the child rows on org delete.
-- Append-only (expand): drop the old FK, re-add it with the cascade action. No data change.
alter table webhook_events drop constraint webhook_events_org_id_fkey;
alter table webhook_events
  add constraint webhook_events_org_id_fkey
  foreign key (org_id) references orgs(id) on delete cascade;
