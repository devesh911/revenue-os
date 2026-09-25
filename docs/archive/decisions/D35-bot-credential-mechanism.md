# D35 — Bot credential mechanism: classic PAT + account-level least privilege (DRAFT — awaiting Devesh's merge per dev-workflow §13)

**Status:** Draft, from the 2026-07-11 S13 preflight. Not law until merged.
**Affected law-docs (edited in this PR):** security.md S13.2 · docs/runbooks/incident.md (kill-switch procedure, implements S13.9 — no law change, new operational content).
**Companion tooling (orchestrator repo, already committed):** `scripts/preflight_check.sh` (verifier + live capability rehearsal, gates `state/S13_PREFLIGHT_OK`) · `scripts/killswitch.sh` (local half of S13.9) · `.agent.env.example`.

## Context

S13.2 prescribes "a fine-grained PAT: contents:write + pull_requests:write on this repo only."
GitHub's constraint makes that impossible here: **fine-grained PATs can only target repositories
owned by the token's resource owner** (the creating account or an org it belongs to). The bot is a
collaborator on `devesh911/revenue-os` — a personal-owner repo it does not own — so it cannot mint
a fine-grained PAT for it. The letter of S13.2 was written assuming a capability GitHub does not
offer for this topology; the preflight is the first thing that tried to execute it.

## Decision

1. **Machine account** (Devesh-created, 2FA per S11.1), invited as a **Write** collaborator on
   exactly this repository — least privilege enforced at the *account* level rather than the
   token's repo list.
2. **Classic PAT with `repo` scope only** — explicitly **no `workflow` scope** (GitHub rejects any
   push touching `.github/workflows` from such a token: CI stays out of the bot's reach), no admin,
   nothing else. Lives only in `orchestrator/.agent.env` (0600, gitignored); `orc.sh` exports it so
   every push and `gh` call in orchestrator sessions authenticates as the bot, never as Devesh —
   retiring the identity-sharing bypass hole (S13.1/D32).
3. **The envelope is rehearsed, not assumed.** `preflight_check.sh` proves, live against GitHub,
   before creating the `S13_PREFLIGHT_OK` marker the watchdog requires: bot CAN create branches,
   commit, open PRs · CANNOT modify workflows, approve its own PRs, merge to main (ruleset,
   no bypass), or reach settings/secrets/rulesets (not admin). It also verifies the ruleset is
   active with admin-only bypass, `.agent.env` hygiene (mode 600, gitignored, non-owner identity),
   and dry-runs the kill-switch (S13.9 "rehearsed").

## Alternatives rejected

- **Fine-grained PAT as written:** structurally unavailable (ownership constraint above).
- **Transfer the repo to an organization** to enable org-owned fine-grained PATs: heavier move with
  billing/ruleset implications, not justified by token mechanics alone — recorded as the reversal
  path instead.
- **GitHub App installation:** the architecturally cleanest credential (installation-scoped,
  short-lived tokens) but disproportionate for a solo setup; becomes attractive when more than one
  machine consumer exists.
- **Keep using Devesh's identity with deny-lists:** the interim state D32 documented — deny-lists
  are friction, not boundaries; this ADR exists to end it.

## Consequences

- S13.2's *intent* (minimal, repo-confined, non-approving credential) is preserved; its *letter*
  changes from token-scoped to account-scoped confinement, with an executable proof.
- The preflight marker becomes the single gate for unattended runs; re-running the preflight after
  any credential change is the maintenance ritual.
- A revoked/expired PAT fails the preflight loudly (401) rather than silently degrading.

## Reversal trigger

Repo moves under an organization (switch back to a fine-grained PAT with org resource owner), or a
second machine consumer appears (switch to a GitHub App). Either way `preflight_check.sh` re-proves
the envelope before the new credential unlocks anything.
