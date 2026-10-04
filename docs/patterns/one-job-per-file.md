# Pattern: one job per file (a folder behind its entry file)
The done gate's split (Slice 0) shows it: the file the hooks call stayed where it was, and its code moved into a
folder beside it, one job per file, each file opening with a comment that names its job.
- `scripts/done-gate.ts`, the entry: hands a hook event to `scripts/done-gate/hook.ts` and a command to
  `scripts/done-gate/cli.ts`, loading them inside its error handling, so a file that fails to load refuses a merge.
- `scripts/done-gate/diff.ts`: the change as git reports it.
- `scripts/done-gate/rules.ts`: the done rules, and which files decide what "done" means.
- `scripts/done-gate/snapshot.ts`: the exact code in a checkout, as a tree id.
- `scripts/done-gate/store.ts`: the gate's record, one small file per fact.
- `scripts/done-gate/stop.ts`: what happens when an agent stops.
- `scripts/done-gate/merge-gate.ts`: when an agent's `gh pr merge` may go through.
- … and the rest of the folder, none of it called utils, helpers or common.

Each file's first line names its job (an excerpt; `bun run guards` fails when it no longer matches):
```ts
// scripts/done-gate/diff.ts
// The change as git reports it: the files a diff touches, the files it deletes, and every line it adds and removes,
// numbered, with the hunk (the run of changed lines) it sits in.
…
export function parseDiff(diff: string): {
```
Rules: one job per file, named in a header comment on its first line · no catch-all `utils`, `helpers` or
`common` file: a small function lives with the job that uses it · siblings import each other in one direction
only (Biome's `noImportCycles` fails a circle) · the old path keeps working: a library's old path exports exactly
the old public names, no more, and a program's entry (like the gate's) loads its folder only inside its error
handling, so a file that fails to load is reported instead of silently skipping the program · the move is its own
commit and changes no behaviour, its tests unchanged but for one that reads the moved file's own text, which reads it
where it moved (`docs/fix-when-touched.md`, entry 10).
