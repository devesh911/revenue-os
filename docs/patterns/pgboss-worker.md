# Pattern: pg-boss consumer (idempotent step + workflow_runs write-back)
```ts
boss.work("place_call", { teamSize: 4 }, async (job) => {
  const { runId, orgId } = job.data;
  await withOrg(orgId, async (db) => {
    const run = await db.getRun(runId);
    if (run.status !== "running") return;                 // idempotency: stale/duplicate job -> no-op
    const verdict = await guard(orgId, run.contactId, "voice");   // S8.2 — before ANY send
    if (!verdict.ok) return db.parkRun(runId, verdict.reason);
    const call = await channels.voice.place(run.contactId);       // via packages/channels only
    await db.advanceRun(runId, { step: "await_call", providerRef: call.ref });
  });
});
```
Rules: check run state first · guard() before sends · advance the run in the same withOrg scope · handler small, logic in harness.
