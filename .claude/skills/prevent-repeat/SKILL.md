---
name: prevent-repeat
description: Use whenever Devesh corrects an agent's work ("that's wrong", "I told you…", "revert it", "still broken", "this isn't what I asked") or a bug reaches main. Fixes the instance, then turns that kind of mistake into a check (a type, a test, a lint or done-gate rule, or a verifier line) so no agent can repeat it.
---

# Prevent the repeat

A mistake fixed once is a mistake Devesh corrects again next week. Fix the instance, then make the whole
kind of mistake impossible or caught, so nobody has to remember it.

1. **Fix what Devesh pointed at**, if it isn't fixed yet, and show him the result.
2. **Name the kind of mistake** in one plain sentence, not this one instance. For example, "agents
   present sample data as real", not "row 3 had a fake id".
3. **Take the highest step that can catch it.** Stop at the first one that works:
   1. *Make it impossible.* Change a type, a database constraint or the shape of the code so the
      mistake can't be written: one shared function instead of copies, and delete the other way of
      doing it.
   2. *Make CI reject it.* Add a test, a Biome rule, a guard in `scripts/guards/` (listed in
      `scripts/guards.sh`) or a rule in `scripts/done-gate/rules.ts`. Prove it catches the mistake: put
      the mistake back, show the check failing, then remove it again. Paste both runs in the PR.
   3. *Teach the verifier.* For what only a look at the running product can catch, add a line under
      "Known ways work looks done but isn't" in `.claude/agents/verifier.md`.
   4. *Teach the procedure.* Add the missing step to the skill for that part of the code.
   5. None of these fits: say why in the PR. A line in `lessons.md` on its own is not a fix.
4. **Record one line** in `lessons.md`: `YYYY-MM-DD · <the kind of mistake> → caught by <the check>`.
5. **Ship it as its own small PR** (off-roadmap), with the failing-then-passing runs as its evidence.
