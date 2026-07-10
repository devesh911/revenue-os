# Development Workflow — how the code gets written (v2)

> **Status:** Authoritative for process. **Self-contained by design:** every document in `docs/` carries its full context — no conversation, chat history, or person's memory is required to act on it. Planning happens inside the repo (Claude Code sessions and the orchestrator); decisions change via §13, nowhere else.
> **Companions:** project-spec.md (what) · db-design.md (data) · tech-stack.md (tools, incl. T26 harness spec) · security.md (controls, incl. S13 agent-ops rails).

---

## 0. Roles and the three loops

**Roles.** Devesh = architect, reviewer, merger of record — the only human gate. Claude Code = implementer (interactive Mode A, or orchestrated Mode B with sub-agents). Planning sessions = any Claude session that drafts plans/ADRs from these docs.

**Loop 1 — Strategy.** A planning session (or Devesh) drafts an ADR + doc edits → PR → CI → **Devesh merges** (§13). Docs are law the moment they merge; agents treat `docs/` as read-only input.
**Loop 2 — Build.** One task → branch → tests-first → implementation → gates → review vs §6 → PR. In Mode B this loop runs autonomously with structural human gates (§4B).
**Loop 3 — Release.** Merge → staging auto-deploys; a git tag cut by Devesh promotes to prod; health-gated cutover; rollback = previous tag.

## 1. Repository layout

```
revenue-os/
├─ CLAUDE.md                    # working agreement (+ /goal orchestrator pointer)
├─ .claude/
│  ├─ commands/goal.md          # 5-line shim → delegates to orchestrator/
│  └─ skills/                   # Devesh-curated skills (frontend, db, devops). Sessions read the matching skill before work; skills advise, docs rule.
├─ lessons.md                   # append-only field notes (agents write; §13 consumes)
├─ docs/                        # the five laws + patterns/ + runbooks/ + decisions/ (ADRs)
├─ supabase/{migrations,seeds}
├─ apps/{console,www}
├─ services/worker
├─ packages/{db,harness,channels,shared}
├─ tests/rls_coverage.sql
├─ docker/ · .github/workflows/
└─ orchestrator/                # Mode B cockpit — OWN nested git repo, ignored by main (§4B)
```

**Write-ownership (D21):** worker owns `workflow_runs/conversations/messages/memories/usage_events/scores/outcomes(agent)`; console owns `tasks status/dispositions/org config/agent+workflow drafts/KB`. All DB access via `packages/db`. Console never imports `harness`.

## 1b. Code architecture standards (modularity, DRY, dynamic-by-config)

### Backend (packages & worker)
- One responsibility per file; shared types only in each package's `types.ts`; imports only through package roots (`@harness/*` paths), never deep file paths across packages.
- Packages are side-effect-free libraries; processes start only in `services/worker/src/index.ts` and app entrypoints (also where Bun-specific code is allowed — G1).
- "Dynamic" on the backend means **closed sets interpreted from config**: workflow step kinds (T26.2), job types (T26.4), tool registry (T26.1). Extending a set = code + ADR; consuming a set = config rows. Never `if (vertical === …)` outside seeds.

### Console (`apps/console/src/`) — feature-sliced, DRY by construction
```
app/         # providers (Query, Supabase, Sentry, PostHog), router, auth guard — wiring only
screens/     # 4 route-level composers (TaskQueue, LiveMonitor, ContactTimeline, Dashboard) + admin/
features/    # tasks/ transcripts/ contacts/ dashboard/ admin/  — each: components/ hooks/ api.ts
components/ui/  # ~10 dumb primitives (Button, Card, Table, Badge, Modal, Tabs, Toast, Field…)
lib/         # apiFetch (from packages/shared), supabase client, analytics, sentry
hooks/       # cross-feature generic hooks only (useDebounce, useHotkey)
```
**Rules (review-blocking):**
- **R1** Screens compose features; features never import other features (share via `packages/shared` or lift to a screen).
- **R2** ALL server state through TanStack Query hooks in `features/*/api.ts`, named `useXQuery`/`useXMutation`, keys from one `queryKeys` factory (`docs/patterns/tanstack-query.md`). **No `useEffect` for data-fetching, ever.**
- **R3** Mutations that a human watches (claim task, tag disposition) are optimistic with rollback — the pattern file shows the exact shape.
- **R4** Components: typed props, no fetching inside, ≤150 lines or extract, second usage → promote to `components/ui` or the feature's `components/`.
- **R5** **Dynamic-by-config is the DRY engine:** vertical custom fields render through ONE `<DynamicField def={field_definition} />` (text/number/bool/date/enum) used by every form and detail view — real-estate vs ceramic screens differ by *rows in `field_definitions`*, zero copied JSX. Same principle: dispositions picker, outcome kinds, pipeline stages all render from their tables.
- **R6** Single sources of truth: shapes = Zod in `packages/shared` (imported, never re-declared); visual tokens = `packages/shared/tokens.css` (console + www consume the same variables); copy for enums = the seed tables, not string literals.
- **R7** State placement: server → TanStack; local UI → `useState`; sharable location → URL (wouter params). **No global store** until a measured pain says otherwise (ADR to add one).
- **R8** Error boundary per screen; Realtime subscriptions in one `features/transcripts/hooks/useLiveTranscript.ts`, cleaned up on unmount; loading/empty/error states are part of Done, not polish.
- **R9** Tests: `components/ui` get render tests; `api.ts` hooks get msw-less integration via the real local API where practical; the four screens are covered by Playwright smoke (T12).

### www (`apps/www`) — Astro
Content collections for case studies/pages (markdown in, pages out); zero client JS unless an island justifies itself in the PR; consumes `tokens.css` only — no component sharing with the console.

## 2. Day-0 bootstrap (ordered)

1. `unzip revenue-os-starter.zip && cd revenue-os`
2. Repo-local git identity → `git init` → `git add -A && git commit -m "chore: scaffold"`.
3. `gh repo create <you>/revenue-os --private --source=. --remote=origin --push`.
4. **S13.1/S13.2 before any autonomous session:** GitHub ruleset on `main` (PR + CI required, 1 approval, no force-push/deletion, `docs/**` requires your review) · fine-grained PAT (contents + PRs, this repo only) onto the orchestrator machine.
5. Pin Bun (`bun --version` → the three `PIN_ME`s) · `bun install` · `supabase init --force && supabase start` · `cp .env.example .env` (local values only — S13.3) · `bun run typecheck && bun run lint && bun test` green.
6. Cloud once: Supabase project `ap-south-1` + link · Cloudflare DNS/Pages · VPS per security S3.
7. Hand task 1 to Mode A, or seed the orchestrator's HANDOFF and run `/goal` (§4B).

## 3. Branches, commits, PRs

`main` protected (ruleset above). One branch per task: `feat/task-NN-slug` · conventional commits · PR per task with the §6 checklist in the body. **Mode B stacks branches:** task N+1 branches off task N's tip; PR base = previous branch (first task bases on `main`); Devesh reviews bottom-up and merges the stack in order. Agents never approve or merge anything (structurally impossible per S13.1).

**Stack maintenance (D32).** Fixes land on the *lowest* affected branch and propagate upward in **one batched cascade pass** — never per-fix (the 2026-07-10 shakedown left 41 of 69 commits on the stack tip as cascade merges). Stacked PRs merge bottom-up with **merge commits — never squash or rebase** (squash rewrites the patches and breaks every PR above it); delete each head branch on merge so GitHub retargets the next PR automatically.

**Solo-mode merge (D32).** With one human, GitHub's no-self-approval rule means the 1-approval requirement is satisfied by the **ruleset bypass, exercised by Devesh personally**: `gh pr merge <N> --merge --delete-branch --admin` from his own terminal (or the web UI's bypass-rules merge). The bypass *is* the human approval — deliberate, logged, his alone. Two disciplines make it safe: bypass only PRs whose required `checks` run is **observed green** (S13.7 — an absent check is a stop signal, not a bypass candidate), and the approval rule itself is never removed — it is what stops any *agent* session (sharing Devesh's identity until S13.2's bot lands; holding a non-approving token after) from turning green CI into a self-merge.

## 4. Session protocols

### Mode A — single interactive session
One task, one session, one branch. Opening template: *"Read CLAUDE.md. Read docs/project-spec.md §12 task N + cited docs + any matching .claude/skills/. Plan first (files, tests, ambiguities) — wait for approval. Then TDD. Imitate docs/patterns/*. Finish with the §6 checklist."* Rules: plan→approval→code · tests first · surprises → `lessons.md`, never silent scope/doc changes · fresh session per task · paste errors verbatim.

**Mode A rails (D32).** Mode A shares Mode B's mechanical rails — the root `.claude/settings.json` deny-list (merges, reviews, force-push, `.env`) applies to every session in this repo, and blanket `gh pr *`-style allows are forbidden in local settings. Mode A also runs inside the same WIP cap (§4B): at the cap, sessions fix and support review — they don't start new tasks. Sustained multi-task throughput is Mode B's job, behind the S13 preflight. Until the S13.2 bot identity exists, Mode A sessions share Devesh's ruleset-bypass-capable identity — one more reason the deny-list and the cap are not optional.

### Mode B — orchestrated multi-agent (the `/goal` loop)
**Topology:** `orchestrator/` is a nested git repo (ignored by main) holding its own CLAUDE.md, `.claude/{commands,agents,settings.json,hooks,state}`, and `scripts/autoresume.sh`. Sessions run from `orchestrator/`; parent CLAUDE.md + docs auto-load as law; `additionalDirectories: ["../"]` lets agents edit core code. A root `/goal` shim delegates here.

**Roles:** **Orchestrator (Fable, main thread)** = planner + reviewer + test-authorship decider — writes the failing tests **itself** for security/RLS/migration/guard-critical tasks (test-is-spec, §5), delegates routine RED to the **tester** (Opus). **Worker** (Opus) implements one task exactly. **Scout** (Haiku, read-only) recons docs/code to keep worker context lean.

**The loop per task:** branch off the stack tip → RED (author per rule above; tests from the task's acceptance criteria) → GREEN (worker, minimal) → REFACTOR → gates (`bun test`, `lint`, `typecheck`, `rls:check` when DB touched) → orchestrator review vs §6 + CLAUDE.md non-negotiables + moat invariants → ≤2 revise rounds → still red = mark blocked, emit `NEED_HUMAN: <reason>` → else push, `gh pr create` with the checklist, then **verify the pipeline ran (D32):** `gh pr checks` must show the required `checks` run *executed and concluded green* on GitHub — an absent or red check is a stop signal (fix it, or `NEED_HUMAN`); local-gate output never substitutes (S13.7) → update HANDOFF (incl. BRANCH STACK), checkpoint-commit the orchestrator repo. Sentinels are the final output line: `GOAL_COMPLETE` / `NEED_HUMAN: …`; otherwise take the next task — never idle. **WIP cap (D32):** at ≥3 open unmerged task PRs, stop taking tasks and emit `NEED_HUMAN: stack full — review bottom-up` (cap overridable per-goal in HANDOFF GOAL).

**State discipline:** assume the session dies any moment. `state/HANDOFF.md` sections — GOAL · TASK LIST · CURRENT/NEXT · BRANCH STACK · IMPLEMENTATION NOTES · ESCALATIONS (mirrors `lessons.md`) · **USER NOTES** (Devesh's steering channel; read every cycle, acknowledged by acting). SessionStart/End hooks persist `session_id` and auto-checkpoint both repos (feat-branches only, never main). `scripts/autoresume.sh` resumes headlessly after crashes or usage-limit windows (parses reset time, sleeps, retries; exits on sentinels).

**Findings ≠ decisions:** agents append findings to `lessons.md` + HANDOFF ESCALATIONS. Doc changes go through §13 only — and `Edit(docs/**)` is mechanically denied besides.

**Safety rails — security.md S13, all nine, non-negotiable.** The short form: ruleset + minimal PAT before first run · secret-free machine · writer agents have no web access · deny-lists are friction, not boundaries · CI is the trust anchor · merges, prod tags, and docs are structurally human · kill-switch rehearsed.

## 5. TDD mechanics
Red (tests from acceptance criteria — reviewed/authored by the reviewer for critical work) → Green (minimal) → Refactor. Locations: unit colocated · integration vs `supabase start` + real pg-boss in `services/worker/test/`, `packages/db/test/` · RLS + cross-tenant denial in `tests/` · webhook fixtures (record real payloads; out-of-order + duplicate cases mandatory) · Playwright in `apps/console/e2e/`. Evals gate activations (`bun run evals`), not merges.

## 6. Definition of Done (PR checklist)
Tests first & green · lint (G1) + typecheck · new tables ⇒ RLS + coverage + denial test · new boundary ⇒ Zod in shared · sends/tools via `guard()` with autonomy class · metered + audited where applicable · no BOM violations · docs touched or `lessons.md` noted on any contradiction · self-review of the full diff · **frontend: R1–R9 respected (no effect-fetching, DynamicField for custom fields, states handled)** · **human-gated criteria declared as ⚠ residuals** (PR body + HANDOFF ESCALATIONS; task closes "done (residual: …)" — spec §12 protocol, D34).

## 7. Migrations — expand–contract, always
`supabase migration new` → SQL (copy db-design verbatim where it exists) → local `db reset` proves clean replay → CI dry-run → staging → prod-by-tag **before** dependent code cuts over. Never edit applied migrations; never breaking DDL under a running worker.

## 8. Seeds & test data
`bun run db:seed <pack>` loads the vertical pack. Tests create throwaway orgs. No production data locally; staging is synthetic until a pilot DPA says otherwise.

## 9. Scripts are the interface
`bun run dev · test · lint · typecheck · db:migrate · db:reset · db:seed <pack> · rls:check · evals` — humans and agents alike; flags/env live in scripts, not in muscle memory.

## 10. Deploy & rollback
Merge → staging (compose stack #2 + Pages preview) → Playwright smoke. **Prod: only a Devesh-cut tag** → migrations → image swap → `/health` + `/ready` gate → cutover. Rollback = previous tag; migration corrections are new migrations. Sentry release marker + 15-min watch.

## 11. Cadence (solo + autonomous, sustainable)
**Mon (30m):** set the week's goal(s); write acceptance criteria where §12 is thin; drop steering into HANDOFF USER NOTES. **Tue–Thu:** Mode B runs; you review the PR stack bottom-up in batches. **Fri (60m):** dependency PRs · `lessons.md` + ESCALATIONS → a planning session drafts any ADRs (§13) → you merge · S12.3 spot-walk · GTM block per phase. Any incident → S-control or eval persona same day.

## 12. What agents must never do
Edit applied migrations · touch `.env`/secrets · bypass `guard()` or `packages/db` · mutate active agent/workflow versions · add a dependency without a BOM row · edit `docs/**` or CLAUDE.md · approve/merge any PR · deploy prod · force-push. (Mechanically denied where possible; structurally blocked by S13 where denial can be bypassed.)

## 13. Decision protocol (self-contained; replaces any chat dependency)
**Trigger** (lessons.md finding, review challenge, new constraint) → **ADR draft**: `docs/decisions/Dnn-title.md` — Context · Decision · Alternatives · Consequences · Reversal trigger — plus the edits to the affected law-doc(s) in the same PR (registry §0 updated if ids change) → CI → **Devesh merges** (the only path; ruleset enforces it). **Triage (D34):** a **blocking** doc bug — the task cannot proceed as documented — gets its mini-ADR PR drafted immediately, and the task PR notes the deviation and links it; **cosmetic** findings batch into the Friday pass (§11). Either way, the lessons.md entry lands first. Any session may *draft*; only a human *decides*. If code and docs disagree, docs win and the disagreement becomes a lessons.md entry → this protocol. A doc that requires outside context to act on is a doc bug — fix the doc.
