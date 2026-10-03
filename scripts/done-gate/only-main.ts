// Whether what changed in a checkout since the session last accepted it is only main arriving: a pull of main, or a
// switch or reset to a commit origin/main holds, with the checkout's own edits and new files as they were. Anything
// else is the session's to answer for at its stop, however it got there: a commit, a switch back to a branch after a
// visit to main, a reset to another branch's commit, a fast-forward to one.

import { extra } from "./checkouts";
import { git } from "./git";

/** `extraBefore`: what the checkout held beyond its HEAD commit when the session noted it (checkouts.ts, extra). */
export function onlyMainArrived(
  root: string,
  extraBefore: string | undefined,
  tree: string,
) {
  const head = git(root, ["rev-parse", "HEAD"], {}, true);
  return (
    Boolean(head) &&
    extraBefore === extra(root, tree) &&
    git(root, ["merge-base", "HEAD", "origin/main"], {}, true) === head
  );
}
