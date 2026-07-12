# Go-live runbook — flipping PHASE: SETUP → LIVE (every task here is Devesh-only)

Agents cannot perform these (classifier-blocked, credential-gated, or account-level). Work top to
bottom; each section says how to verify. The LAST step flips the phase — do it only when every
box above it is checked. Companion: D36 (the decision), CLOUD-SETUP-RUNBOOK (orchestrator/state/,
the cloud bootstrap you already ran).

## 1 · Ruleset back to full force (GitHub → Settings → Rules → ruleset 18778679)

- [ ] Restore: required approvals **1**, require code-owner review (arms CODEOWNERS on `docs/**`
      + `CLAUDE.md`), required status check `checks`, block force-push + deletion. The pre-v2.1
      config is saved at `orchestrator/state/ruleset-18778679-backup-2026-07-11.json`; apply via
      UI or `gh api -X PUT repos/devesh911/revenue-os/rulesets/18778679 --input <file>`.
- [ ] Bypass actors: repo-admin (you) only. Verify no agent-usable identity has bypass.
- [ ] Verify structurally: have an agent session attempt `gh pr merge` on a green test PR — it
      must fail with a review-required error, not a classifier denial.

## 2 · Bot identity + preflight (S13.2, D35) — required before any unattended run

- [ ] Create the bot machine account; add as Write collaborator on exactly this repo; 2FA on.
- [ ] Mint a **classic PAT, `repo` scope only (no `workflow`)**; paste into
      `orchestrator/.agent.env` (mode 0600, gitignored — template: `.agent.env.example`).
- [ ] Run `orchestrator/scripts/preflight_check.sh` — it rehearses the capability envelope (CAN
      branch/PR · CANNOT merge/approve/touch workflows/settings) and writes
      `state/S13_PREFLIGHT_OK` only on all-pass. The autoresume watchdog stays locked until then.

## 3 · Rotate every secret that existed during SETUP (treat all as burned)

- [ ] Supabase: DB password + access token (dashboard → project settings); update GitHub
      `staging` environment secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`).
- [ ] Vapi: API key + `server.secret` (write-only at the API — overwrite assistant config and the
      VPS env together; the password manager holds the only copy).
- [ ] `VAPI_WEBHOOK_SECRET` on the VPS env (the local `demo-local-secret` never leaves this
      machine, but rotate the real one anyway).
- [ ] Delete local-era demo data from any database that graduates: user `demo@local.test`, orgs
      `demo-local` + seed packs. (Local stack: `bun run db:reset` covers it.)
- [ ] `gh api repos/devesh911/revenue-os/actions/secrets` + environment secrets — audit that only
      expected names exist.

## 4 · Account + edge hardening (S11.1, S3.3, S2.1)

- [ ] 2FA on GitHub, Supabase, Vapi, Cloudflare, registrar — everywhere (S11.1).
- [ ] Supabase Data API OFF for production project (S2.1); confirm PostgREST is unreachable.
- [ ] Cloudflare: origin reachable only via CF (S3.3); Bot Fight Mode stays OFF until apps/www
      exists (S4.3 conflict, STATE DECISIONS); webhook paths never challenged.
- [ ] VPS: SSH keys only, no password auth; firewall allows 80/443 + SSH from your IP; worker
      container runs non-root (Dockerfile already does — verify on the box).

## 5 · Monitoring — "every step watched" starts here, before traffic

- [ ] Uptime monitor on `https://<worker>/health` AND `/ready` (both must go red independently).
- [ ] Log drain for the worker container (pino JSON → your chosen sink); alert on `level>=50`.
- [ ] Supabase advisors: run security + performance advisors; schedule a weekly pass.
- [ ] GitHub: Dependabot alerts on; `bun audit` already in CI — add failure notifications to
      email/phone you actually read.
- [ ] pg-boss: alert when `pgboss.job` failed-state count grows (poisoned-job signal) — the
      dead-letter review task lands with the harness; until then this query is the watch.

## 6 · Kill-switch rehearsal (S13.9) — do it once for real

- [ ] Rehearse: revoke bot PAT → `gh auth logout` on the orchestrator machine → stop watchdog
      (`killswitch.sh`) → confirm a running session's next push fails. Time it; note it in
      `docs/runbooks/incident.md` (create the entry — that file is yours).

## 7 · Repo hygiene only you can do

- [ ] Delete stale REMOTE branches (agents are classifier-blocked from `git push origin
      --delete`): flip-kit item 5, `orchestrator/state/FLIP-KIT-2026-07-11.md`.
- [ ] Re-tighten agent settings deny-lists (`gh pr merge`, `gh pr review`, force-push variants)
      in root + orchestrator `.claude/settings.json` — loosening/tightening these is yours alone.

## 8 · The flip (last, and only when 1–7 are all checked)

- [ ] Edit `STATE.md` line 1: `PHASE: SETUP` → `PHASE: LIVE`; commit via PR; merge it yourself
      under the restored ruleset. That single line re-arms every phase-conditional rule (D36) —
      from that commit on, agents stop merging, preflight gates autonomy, and full S13 applies.
- [ ] Tell the next agent session "we're live" — it will re-read STATE.md and confirm the posture
      it now operates under.
