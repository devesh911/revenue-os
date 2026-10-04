// What a session is shown when it starts in a checkout, or starts again after /clear, a resume or a compaction:
// whether it is held to work it found there that never passed the gate (interrupted.ts), and the checkpoint of the
// branch there (checkpoint.ts). Like every tool call, it also notes the checkout (checkouts.ts).

import { checkoutsOf, toplevel, touch } from "./checkouts";
import { checkpointAtStart } from "./checkpoint";
import type { HookInput } from "./hook-io";
import {
  atWorkNow,
  heldTo,
  holdOf,
  noteInterrupted,
  placeOf,
  QUIET_MINUTES,
  WROTE,
} from "./interrupted";
import { snapshot } from "./snapshot";
import type { Store } from "./store";

export async function sessionStart(
  repo: string,
  input: HookInput,
  store: Store,
  session: string,
  codex: boolean,
) {
  const root = toplevel(input.cwd ?? repo);
  const here = !!root && checkoutsOf(repo).includes(root);
  // Before the checkout is noted, which makes what it holds this session's starting point.
  const newly = here ? noteInterrupted(root, store, session, codex) : undefined;
  touch(repo, input, store, session);
  atWorkNow(repo, store, session);
  if (!here) return;
  const h = holdOf(store, session, root);
  let inForce = !!h;
  try {
    inForce = !!heldTo(store, session, root, snapshot(root, false).tree);
  } catch {
    // a checkout the gate can't read: held, and its stop says it was NOT checked
  }
  const where = `${placeOf(root)} (branch ${h?.branch})`;
  const held =
    h &&
    h.why !== WROTE &&
    (inForce
      ? `Done gate: ${where} holds a change that has not passed the gate (${h.why}): work interrupted before it was checked. This session is held to it: each of your stops judges that change, as if you had made it, until one passes on branch ${h.branch} (the done rules, every check, and for product code the verifier's ruling). Finish it, starting from the checkpoint below when there is one; if it is not yours to finish, ask Devesh with \`bun run gate pause "<question>"\`, which ends the hold.`
      : `Done gate: ${where} holds a change that has not passed the gate (${h.why}), and a session that worked there is still at work (seen in the last ${QUIET_MINUTES} minutes): the change is that session's to finish, so leave it alone. If that session stops for good, this one is held to the change: each of your stops judges it until one passes on branch ${h.branch}.`);
  const context = [held, checkpointAtStart(root, store)]
    .filter(Boolean)
    .join("\n\n");
  if (!context) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context,
      },
      ...(newly &&
        inForce && {
          systemMessage: `Done gate ⚠ this session is held to unchecked work: ${where} holds a change that has not passed the gate (${newly}); each of its stops judges that change until one passes on that branch`,
        }),
    }),
  );
}
