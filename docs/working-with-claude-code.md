# Working with Claude Code — the light way (Devesh's operating guide)

Reference, not law — AGENTS.md stays the contract. This page exists because the process
surface grew to ~3,800 lines across ~50 files for a one-person company, and the owner was
spending more time serving the process than shipping. The principle: **AGENTS.md + STATE.md
are the system; everything else must earn its keep.**

## 1 · Default to one plain session (Mode A)

For day-to-day tasks — a route, a page, a hook, a bug — open one Claude Code session, point it
at the top of `STATE.md → NEXT`, and let the AGENTS.md loop run: branch → tests → `bun run
gates` → PR → observed-green → merge → STATE update. No orchestrator, no agent fleet, no
waves.

Reserve the `/goal` multi-agent orchestrator for what it's actually good at: a **large batch of
independent, file-disjoint tasks** (like the 6-page console fan-out). If the work is one task,
the orchestrator is pure overhead — five agent roles coordinating what one session does fine.

## 2 · The comprehension habit (so the codebase never becomes a stranger)

The fix for "Claude built it and I don't understand it" is not more review gates — it's making
explanation a standing part of the loop:

- **After each merged PR**, ask (in the same session): *"Walk me through this diff like I'll be
  debugging it alone at 2am — what runs, in what order, and what breaks first if it's wrong?"*
  Five minutes, spoken-English, no code changes.
- **Weekly-ish**, pick one file or flow you're fuzzy on and run an explainer session:
  *"Explain `services/worker/src/index.ts` top to bottom"*, or *"trace a Vapi webhook from the
  internet to the database row."* `docs/architecture.md` is the map to hang these on.
- **Never merge what you couldn't summarize.** If you can't say in two sentences what a PR does
  and what breaks if it's reverted, that's the signal to ask for the walkthrough *before*
  merging, not after.

Understanding compounds exactly like the code does. Twenty minutes a week keeps you the person
who knows the system, with Claude as the fast pair of hands — instead of the reverse.

## 3 · What NOT to add

- No new skills, agents, checklists, or ceremony **unless the same failure has happened twice
  without one**. Process is a response to observed failure, not anticipated failure.
- No new "current state" ledgers — STATE.md (now), `docs/sdlc.md` (history), `lessons.md`
  (surprises) already overlap at three; a fourth makes truth harder to find, not easier.
- When docs contradict reality: AGENTS.md already answers it — build the correct thing, one
  DECISIONS line, move on. Resist the doc-editing spree.

## 4 · Fast AND solid — resolving the tension honestly

"Enterprise-grade, zero-downtime" and "iterate fast" are not in conflict *at this stage*,
because at this stage enterprise-grade means exactly three things, all cheap:

1. **Staging-first migrations with append-only history** — already live (`deploy.yml`).
2. **An automated, health-gated worker deploy with a fast rollback** — task 14b; the one
   missing piece, and worth more than any amount of extra process.
3. **Boring observability** — pino logs you actually look at, `/health`, and (later) the
   reserved `SENTRY_DSN` wired up.

What it does *not* yet mean: blue/green deploys, load balancers, multi-region, Kubernetes. A
compose restart costing a few seconds on a box with no users yet is the correct trade. Revisit
at the first paying pilot (`architecture.md` §7.2 has the ladder).

## 5 · Secrets sanity in one line

Before adding any variable anywhere, open `docs/secrets-map.md`; after adding it, add its row.
If a value would need to be pasted into chat to proceed, stop — that's a Devesh-terminal task
(hard rail 1).
