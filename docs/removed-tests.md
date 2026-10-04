# Removed tests

Every test file, test (`it(` or `test(`) or `expect` line a change removes is named here by that same change, one line
each, with why. The done gate refuses a change that removes a test without its line here
(scripts/done-gate/removed-tests.ts), shows each line to Devesh at the agent's stop and in CI's log, and
`rules-from-main` refuses a pull request whose body does not copy each line this file gains.

What is not a removal:

- A test moved whole into a file a test runner runs (bun runs `*.test.*`, `*_test.*`, `*.spec.*` and `*_spec.*`;
  Playwright runs `*.e2e.ts`): its first line and each of its expect lines land together, as git's moved-code
  detection sees them. One file split into several is this.
- A test renamed where it stands, none of its expect lines removed.
- An expect line rewritten where it stood, in the same run of changed lines, into one that checks more than a constant.
- An expect line re-indented in its own test, as when the test's body is wrapped in `await withOrg(…, async () => { … })`.

Git sees no move in a block under 20 letters and digits, so two tiny tests swapped in a file are reported removed;
give them names that say what they check, which also makes them long enough.

What is a removal, though the text lives on: a test moved into a file no runner runs (a helper, a note); an expect
moved on its own, without its test, even into another test; a test renamed as its expect lines go (rewritten); an
expect rewritten into `expect(true)`, `expect(1)` or another constant.

The line, newest first under "Lines" (a leading "- " is allowed):

`YYYY-MM-DD · <file> > <test name | expect at line N | whole file> · <why>`

- `<file>` is the test file's path. `<test name>` is the test's name exactly as its `it(` or `test(` line wrote it
  before the change. `expect at line N` is the line the expect had where the branch left main (CI's `checks`,
  `rules-from-main` and an agent's stop all number it so). `whole file` covers a test file the change deletes, and
  everything in it.
- The gate's message for each removal gives the line to write; only `<why>` is yours, in plain words: what checks
  this now, or why nothing needs to.

## Lines
