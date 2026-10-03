# Removed tests

Every test file, test (`it(` or `test(`) or `expect` line a change removes is named here by that same change, one line
each, with why. A test moved into another test file is not removed (the done gate finds moves with git's moved-code
detection); a test or expect line rewritten where it stood is an edit. The done gate refuses a change that removes a
test without its line here (scripts/done-gate/removed-tests.ts), shows each line to Devesh at the agent's stop and in
CI's log, and `rules-from-main` refuses a pull request whose body does not copy each line this file gains.

The line, newest first under "Lines" (a leading "- " is allowed):

`YYYY-MM-DD · <file> > <test name | expect at line N | whole file> · <why>`

- `<file>` is the test file's path. `<test name>` is the test's name exactly as its `it(` or `test(` line writes it.
  `expect at line N` is the line the expect had before the change. `whole file` covers a deleted test file and
  everything in it.
- The gate's message for each removal gives the line to write; only `<why>` is yours, in plain words.

## Lines
