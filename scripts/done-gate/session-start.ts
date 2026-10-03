// What a session is shown when it starts in a checkout, or starts again after /clear or a compaction: whether it is
// held to work it found there that never passed the gate (interrupted.ts), and the checkpoint of the branch there
// (checkpoint.ts). Like every tool call, it also notes the checkout (checkouts.ts).

import { relative } from "node:path";
import { checkoutsOf, identity, keyOf, toplevel, touch } from "./checkouts";
import { checkpointAtStart } from "./checkpoint";
import { git } from "./git";
import type { HookInput } from "./hook-io";
import { HELD, holdIfInterrupted } from "./interrupted";
import type { Store } from "./store";

export async function sessionStart(
  repo: string,
  input: HookInput,
  store: Store,
  session: string,
  codex: boolean,
) {
  const root = toplevel(input.cwd ?? repo);
  const fresh =
    !!root && store.get("seen", keyOf(session, root)) !== identity(root); // new to this checkout
  touch(repo, input, store, session);
  const all = checkoutsOf(repo);
  if (!all.includes(root)) return;
  const newly = fresh
    ? await holdIfInterrupted(root, store, session, codex)
    : undefined;
  const why = newly ?? store.get(HELD, keyOf(session, root));
  const branch = git(
    root,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    {},
    true,
  );
  const held =
    why &&
    `${relative(all[0] ?? root, root) || "the main checkout"} (branch ${branch}) holds a change that has not passed the gate (${why})`;
  const context = [
    held &&
      `Done gate: ${held}: work interrupted before it was checked. This session is held to it: each of your stops judges that change, as if you had made it, until it passes (the done rules, every check, and for product code the verifier's ruling). Finish it, starting from the checkpoint below when there is one; if it is not yours to finish, ask Devesh with \`bun run gate pause "<question>"\`.`,
    checkpointAtStart(root, store),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!context) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
      ...(newly && {
        systemMessage: `Done gate ⚠ this session is held to unchecked work: ${held}; each of its stops judges that change until it passes`,
      }),
    }),
  );
}
