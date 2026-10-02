# When main's copy of the rules refuses every pull request

`rules-from-main` (.github/workflows/rules-from-main.yml) judges every pull request with the copy of the rules
that is already on main, so a branch can't loosen the rules that judge it. The price: if a mistake in main's copy
refuses every pull request, it also refuses the pull request that fixes the mistake, because that fix is judged
by main's copy too. This page is the way back. Only Devesh can do it, because it changes GitHub's settings.

## How you know it is this
- Every open pull request fails `rules-from-main` with the same problem, including one that only fixes that rule.
- The problem is wrong. A real problem is fixed in the pull request, never by this page.
- `checks` (the repository's own tests, run on the branch's code) is green on the fix.

## What to do (about five minutes)
1. An agent opens the fix as its own pull request: the change to `scripts/done-gate/` or to
   `.github/workflows/rules-from-main.yml` that corrects the rule, with a test that fails before the fix. Its `checks` must be green. Its body says which rule changed and why,
   like any rule change.
2. GitHub → Settings → Rules → Rulesets → main-protection (S13.1) → Require status checks to pass: remove
   `rules-from-main` from the list, then Save changes.
3. Merge only that fix pull request, with squash.
4. Back in the same place, add `rules-from-main` again with GitHub Actions as its source, then Save changes.
5. Push any change to one open pull request and see its new `rules-from-main` run pass. (Re-running an old run
   would use the workflow file of that old run, not main's fixed one.)

While the check is off, merge nothing else. Never use an administrator bypass instead: main's ruleset has none,
and the check must come back on as soon as the fix is in.

## Why there is no automatic way back
Anything a branch could switch on to skip main's copy, a careless or forged branch could switch on too. Turning
the check off is a setting only Devesh's own hands change, so the way back can never be used without him.
