# Pattern: one job per file (a folder behind its entry file)
An excerpt of the done gate's split (Slice 0): the file the hooks call stayed where it was, and its code moved
into a folder beside it, one job per file, each file opening with a comment that names its job.
```text
scripts/done-gate.ts            the entry: hands a hook event to hook.ts and a command to cli.ts, loading them
                                inside its error handling, so a file that fails to load refuses a merge
scripts/done-gate/
  diff.ts          The change as git reports it: the files a diff touches and every line it adds, numbered.
  rules.ts         The done rules: what no added line may do (…), and which files decide what "done" means.
  snapshot.ts      The exact code in a checkout as a tree id, with its diff from main and who uses each export.
  store.ts         The gate's record: one small file per fact under .git/done-gate.
  stop.ts          A stop: the session's change in each checkout it worked in is judged (…).
  merge-gate.ts    An agent's `gh pr merge` goes through only when the head commit was proven on this machine.
  …                nineteen files, none called utils, helpers or common
```
```ts
// The change as git reports it: the files a diff touches and every line it adds, numbered.

export type Added = { file: string; line: number; text: string };

/** PURE: `git diff --unified=0` → the files it touches and every line it adds. */
export function parseDiff(diff: string): { files: string[]; added: Added[] } {
```
Rules: one job per file, named in a header comment on its first line · no catch-all `utils`, `helpers` or
`common` file: a small function lives with the job that uses it · siblings import each other in one direction
only (Biome's `noImportCycles` fails a circle) · the old path keeps working: a library's old path exports exactly
the old public names, no more, and a program's entry (like the gate's) loads its folder only inside its error
handling, so a file that fails to load is reported instead of silently skipping the program · the move is its own
commit and changes no behaviour, its tests unchanged (docs/fix-when-touched.md, entry 10).
