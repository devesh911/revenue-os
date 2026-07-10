# Runbook: incident
Assess -> contain (kill key/route) -> rotate -> notify tenant if their data touched -> post-mortem -> new S-control or eval persona (S12.3).

## Agent kill-switch (S13.9)

**Triggers:** an autonomous session pushes or opens PRs outside its task · touches paths it must never touch · emits no HANDOFF update or sentinel past its deadline (**silence is failure, never success**) · anything else that smells wrong. Cut first, diagnose after.

1. **Local half:** `orchestrator/scripts/killswitch.sh` — stops the watchdog, kills the recorded orchestrator session (by its exact session id — other Claude sessions are untouched), shreds `.agent.env`, and re-locks unattended runs (removes `state/S13_PREFLIGHT_OK`).
2. **Remote half (web):** log into the **bot** account → Settings → Developer settings → Personal access tokens → **revoke**. For a full freeze also remove the bot from the repo (repo Settings → Collaborators).
3. **Verify dead:** `GH_TOKEN=<old token> gh api user` errors 401; `tail orchestrator/state/autoresume.log` shows the ENGAGED line and no later cycles.
4. **Audit the blast radius:** `gh pr list --state all --limit 20` for unexpected PRs · `git log origin/main --oneline | head` — main must show only your merges (ruleset guarantees it; confirm anyway) · review recent branch pushes before deleting them.
5. **Post-mortem** per the top line; the finding becomes a new S-control or eval persona (S12.3).

**Rehearsal:** `orchestrator/scripts/preflight_check.sh` exercises the bot's capability envelope live (can branch/commit/PR; cannot modify workflows, self-approve, or merge) and dry-runs the kill-switch on every run — the switch is a fact, not a theory (S13.9).
