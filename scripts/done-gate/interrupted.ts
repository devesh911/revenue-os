// Work interrupted before it was checked. A session that starts in a worktree on a branch, holding a change the
// gate's record does not show passed, may be held to that change: each of its stops judges it, as if the session had
// made it, until a stop passes on it on that branch (stop.ts). A session that writes a branch's checkpoint is held to
// its change the same way (checkpoint.ts). The hold is in force only while no other session that worked there, and
// has not accepted the code as it is, is still at work there: a second session or a teammate beside the one making
// the change leaves it to that one, until that one has been quiet there 15 minutes. A question to Devesh (`bun run
// gate pause`) ends it. Never held: the main checkout, where Devesh keeps files of his own, on any branch; a detached
// checkout, made to read a commit; and a checkout a session only looks at (stop.ts tells Devesh once instead). A
// checkout the gate can't read is not judged: its stop tells Devesh its change was NOT checked.

import { relative } from "node:path";
import { checkoutsOf, identity, idOf, keyOf } from "./checkouts";
import { noDocker } from "./checks";
import { git } from "./git";
import { isProduct } from "./rules";
import { snapshot } from "./snapshot";
import type { Store } from "./store";
import { rulingOn } from "./verdict";

/** The record of sessions held to a change: the key names the session and the checkout, the value the hold. */
export const HELD = "held";
type Hold = { branch: string; why: string };
type Verdict =
  | { ok: true; message: string }
  | { ok: false; headline: string; reason: string };

// Quiet this long in a checkout, a session has stopped working there: one shell command runs 10 minutes at most, and
// a stop's own run is seen by its process (`stopping`), for as long as a Stop hook may run.
export const QUIET_MINUTES = 15;
const STOP_MAX = 3_600_000;

/**
 * At each session start and before each tool call, after the checkout is noted (checkouts.ts touch): `session` is at
 * work in each checkout it is the last to work in. Kept per checkout, so a session busy elsewhere that once looked at
 * a worktree does not keep a hold off there.
 */
export function atWorkNow(repo: string, store: Store, session: string) {
  for (const root of checkoutsOf(repo))
    if (store.get("toucher", idOf(root)) === session)
      store.put("active", keyOf(session, root), String(Date.now()));
}

export const branchOf = (root: string) =>
  git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], {}, true);
/** A checkout as Devesh is told it: its path from the main checkout. */
export const placeOf = (root: string) =>
  relative(checkoutsOf(root)[0] ?? root, root) || "the main checkout";

/** `root`'s code as a tree, and why its change has not passed as the gate's record shows it (no rule or check runs). */
function unpassed(root: string, store: Store, codex: boolean) {
  const tree = snapshot(root, false).tree;
  const from =
    git(root, ["merge-base", "HEAD", "origin/main"], {}, true) || "HEAD";
  const files = git(root, ["diff", "--name-only", from, tree], {}, true)
    .split("\n")
    .filter(Boolean);
  const checked =
    store.get("checked", tree) ??
    (noDocker() ? store.get("partial", tree) : undefined);
  const ruling = rulingOn(store, tree);
  const why = !files.length
    ? undefined
    : !checked
      ? "the checks have not passed"
      : !files.some(isProduct) || codex || ruling?.verdict === "cannot-verify"
        ? undefined
        : !ruling
          ? "product code changed and nobody independent has seen it work"
          : ruling.verdict === "fail"
            ? `the verifier ruled FAIL: ${ruling.note}`
            : undefined;
  return { tree, why };
}

/**
 * At a session's start in `root`, before the checkout is noted (checkouts.ts touch): when it is a worktree on a
 * branch, new to the session or worked in by another session since, and holds a change that has not passed, the
 * session may be held to it. Reads only the gate's record, so it fits in the start hook's 30 seconds.
 */
export function noteInterrupted(
  root: string,
  store: Store,
  session: string,
  codex: boolean,
) {
  if (!branchOf(root) || root === checkoutsOf(root)[0]) return;
  const key = keyOf(session, root);
  const fresh = store.get("seen", key) !== identity(root);
  if (!fresh && store.get("toucher", idOf(root)) === session) return; // its own work: its stops judge it
  let found: { tree?: string; why?: string };
  try {
    found = unpassed(root, store, codex);
  } catch (e) {
    found = { why: `the gate could not read it: ${String(e).split("\n")[0]}` };
  }
  if (!found.why || (!fresh && store.get("accepted", key) === found.tree))
    return;
  hold(store, session, root, found.why);
  return found.why;
}

/** Why the session that writes a branch's checkpoint is held to the branch's change (checkpoint.ts). */
export const WROTE = "this session wrote its checkpoint";

export const hold = (
  store: Store,
  session: string,
  root: string,
  why: string,
) =>
  store.put(
    HELD,
    keyOf(session, root),
    JSON.stringify({ branch: branchOf(root), why }),
  );

/** Is the session of `key` (a session and a checkout) at work there: seen there lately, or in a stop still running? */
function atWork(store: Store, key: string, session: string) {
  const seen = Number(store.get("active", key) ?? 0);
  const [pid = 0, since = 0] = (store.get("stopping", session) ?? "")
    .split(" ")
    .map(Number);
  let stopping = false;
  try {
    stopping = pid > 0 && Date.now() - since < STOP_MAX && process.kill(pid, 0);
  } catch (e) {
    stopping = (e as { code?: string }).code === "EPERM"; // running, as another user
  }
  return Date.now() - seen < QUIET_MINUTES * 60_000 || stopping;
}

/** Another session that worked in `root`, has not accepted its code as it is (`tree`), and is still at work. */
function othersAtWork(
  store: Store,
  session: string,
  root: string,
  tree: string,
) {
  const id = `-${idOf(root)}`;
  return store.list("seen").some(({ key }) => {
    const other = key.slice(0, -id.length);
    return (
      key.endsWith(id) &&
      other !== session &&
      store.get("accepted", key) !== tree &&
      atWork(store, key, other)
    );
  });
}

/** The hold recorded on `session` in `root`, in force or not. */
export function holdOf(store: Store, session: string, root: string) {
  try {
    return JSON.parse(store.get(HELD, keyOf(session, root)) ?? "") as Hold;
  } catch {
    return undefined;
  }
}

/** The hold on `session` in `root` (at code `tree`), when it is in force. */
export const heldTo = (
  store: Store,
  session: string,
  root: string,
  tree: string,
) =>
  othersAtWork(store, session, root, tree)
    ? undefined
    : holdOf(store, session, root);

/**
 * A stop's judgement of `root` for a session held there: on another branch, it is sent back to the held one; a
 * failure says why it answers for this change. `judging` judges the code as it is.
 */
export async function judgeHeld(
  store: Store,
  session: string,
  root: string,
  tree: string,
  judging: () => Promise<Verdict>,
): Promise<Verdict> {
  const h = heldTo(store, session, root, tree);
  if (!h) return judging();
  const where = placeOf(root);
  const why = `This session is held to the change on branch ${h.branch} in ${where} (${h.why}) until a stop passes on it there.`;
  const on = branchOf(root);
  if (on !== h.branch)
    return {
      ok: false,
      headline: `held to the unchecked change on branch ${h.branch}, but ${where} is on ${on || "no branch"}`,
      reason: `You can't finish yet. ${why} Switch back (\`git checkout ${h.branch}\` in ${where}) and finish it, or, if it is not yours to finish, ask Devesh with \`bun run gate pause "<question>"\`.`,
    };
  const j = await judging();
  return j.ok
    ? j
    : {
        ok: false,
        headline: `held to the change found there: ${j.headline}`,
        reason: `${why} If it is not yours to finish, ask Devesh with \`bun run gate pause "<question>"\`.\n${j.reason}`,
      };
}

/** A stop passed on `root`: the hold ends when the checkout is on the held branch. */
export function release(store: Store, session: string, root: string) {
  const h = holdOf(store, session, root);
  return (
    !!h &&
    branchOf(root) === h.branch &&
    !!store.take(HELD, keyOf(session, root))
  );
}
