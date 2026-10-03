// Work interrupted before it was checked. A session that starts in a checkout on a branch other than main, which
// holds a change that has not passed the gate, is held to that change: each of its stops judges it, as if the
// session had made it, until a stop passes on it (stop.ts). On main, where Devesh keeps files of his own he never
// commits, and in a checkout a session only looks at, he is told once instead (stop.ts).

import { keyOf } from "./checkouts";
import { git } from "./git";
import { snapshot } from "./snapshot";
import type { Store } from "./store";
import { judge } from "./verdict";

/** The record of sessions held to a change: the key names the session and the checkout, the value why it is held. */
export const HELD = "held";

/**
 * At a session's first start in `root`: when the checkout is on a branch other than main and holds a change against
 * where it left origin/main that has not passed the gate (the done rules, every check, and for product code the
 * verifier's ruling, as the gate's record holds them), hold the session to it. Returns why the change has not
 * passed, or nothing when the session is not held. A checkout the gate can't read holds it too: its stop says why.
 */
export async function holdIfInterrupted(
  root: string,
  store: Store,
  session: string,
  codex: boolean,
) {
  const branch = git(
    root,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    {},
    true,
  );
  if (!branch || branch === "main") return;
  let why: string;
  try {
    const snap = snapshot(root);
    if (!snap.files.length) return;
    const proof = await judge(snap, store, codex, true);
    if (proof.ok) return;
    why = proof.headline;
  } catch (e) {
    why = `the gate could not read it: ${String(e).split("\n")[0]}`;
  }
  store.put(HELD, keyOf(session, root), why);
  return why;
}
