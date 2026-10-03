# Pattern: pg-boss job handler (idempotent step + workflow_runs write-back) — no example yet

**Do not copy a job handler from this file's history, or from today's call job.** The example that stood here
called functions nothing has (`db.getRun`, `db.parkRun`, `db.advanceRun`), called `guard` and the voice doorway
with arguments they don't take, and placed the call inside the open database transaction. It is deleted. Today's
real call job, `handlePlaceCall` in `services/worker/src/handlers/place-call.ts`, also dials inside the
transaction, so a failure after the provider accepted the call undoes the record of it, and pg-boss's retry rings
the lead again; and some of its queries filter by row id without the company. The background-job example comes
back as an excerpt of real code with Slice 1 · "A call or WhatsApp send is never blindly repeated", which fixes both.

What is true today, and stays true:
- Jobs carry ids only (`orgId`, `runId`); the `pgboss` schema has no row-level security by design, so a handler
  re-enters `withOrg(pool, orgId, …)` (`packages/db/src/client.ts`) before it reads anything.
- A handler first reloads its row (`for update`) and does nothing when the job is stale or a duplicate: the run
  has moved on, or its outcome is already recorded.
- Every send goes through a doorway in `packages/channels` (`voice.place` in `packages/channels/src/voice.ts`),
  which runs `guard()` first and, when it blocks, sends nothing and returns the reason. Today's call job drops that
  reason; Slice 1 · "A lead's sequence never stops silently" saves it and re-schedules the lead or hands it over.
- Each queue is created, with its settings, in `services/worker/src/jobs.ts`; jobs the scheduler queues don't yet
  keep those settings (the never-blindly-repeated line above fixes that too).

Rules: reload the row and no-op if stale, first · `guard()` before any send, only through `packages/channels` ·
the handler stays small, the logic lives in `packages/harness` · never repeat a call or message blindly: save what
you are about to send, call the provider outside any open transaction, then save the result.
