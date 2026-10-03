// A stop: the session's change in each checkout it worked in is judged, and until it is proven the agent is sent
// back to work.

import { relative } from "node:path";
import { extra, idOf, keyOf, madeHere, rootsOf } from "./checkouts";
import { git } from "./git";
import { type HookInput, say } from "./hook-io";
import { isProduct } from "./rules";
import { snapshot } from "./snapshot";
import type { Store } from "./store";
import { judge, rulingOn } from "./verdict";

const MAX_BLOCKS = 5; // then the agent may stop, shown to Devesh as NOT DONE (Claude Code's own cap is 8)

export async function stop(
  input: HookInput,
  repo: string,
  store: Store,
  session: string,
  codex: boolean,
) {
  const { all, here, roots } = rootsOf(repo, store, session, input.cwd);
  const name = (root: string) =>
    relative(all[0] ?? repo, root) || "the main checkout";
  const started = Number(store.get("started", session) ?? 0);
  const trees: string[] = [];
  const work: { key: string; root: string; tree: string; where?: string }[] =
    [];
  const notes: string[] = [];
  for (const root of roots)
    try {
      const key = keyOf(session, root);
      const tree = snapshot(root, false).tree;
      trees.push(tree);
      const toucher = store.get("toucher", idOf(root));
      if (toucher && toucher !== session) continue; // another session worked here since: its change, not this one's
      const accepted = store.get("accepted", key);
      if (tree === accepted) {
        // Work from before the session, never judged: say so once, rather than pass it in silence.
        if (
          tree === store.get("baseline", key) &&
          !store.get("warned", `${key}-${tree}`)
        ) {
          store.put("warned", `${key}-${tree}`, "1");
          if (snapshot(root).files.some(isProduct) && !rulingOn(store, tree))
            notes.push(
              `Done gate ⚠ this session changed nothing in ${name(root)}, but it holds product changes from before the session that nobody has verified`,
            );
        }
        continue;
      }
      // A pull, switch or reset to commits the session did not make (or that main already holds), with the
      // checkout's own edits and new files as they were: not the session's work.
      const head = git(root, ["rev-parse", "HEAD"], {}, true);
      if (
        accepted &&
        store.get("extra", key) === extra(root, tree) &&
        (!madeHere(root, started) ||
          git(root, ["merge-base", "HEAD", "origin/main"], {}, true) === head)
      ) {
        store.put("accepted", key, tree);
        continue;
      }
      work.push({
        key,
        root,
        tree,
        where: root === here ? undefined : name(root),
      });
    } catch (e) {
      notes.push(
        `Done gate ⚠ could not read ${name(root)} (${String(e).split("\n")[0]}): its change was NOT checked`,
      );
    }
  if (!work.length) return notes.length ? say(notes.join("\n")) : undefined;
  if (input.background_tasks?.length || input.session_crons?.length)
    return say(
      "Done gate ⏳ not checked yet: background work is still running. The first stop after it ends is checked.",
    );
  for (const tree of new Set([...trees, ...work.map((w) => w.tree)])) {
    const pause = store.take("pause", tree);
    if (pause)
      return say(
        `Done gate ⏸ waiting on you: ${pause} (the change so far is NOT verified)`,
      );
  }
  // After the agent gave up on this exact code, only what is already known counts: no check runs again.
  const print = work
    .map((w) => w.tree)
    .sort()
    .join(" ");
  const gaveUp = store.get("gave-up", session) === print;
  const passed: string[] = [];
  let failed: { headline: string; reason: string } | undefined;
  for (const w of work) {
    const j = await judge(snapshot(w.root), store, codex, gaveUp);
    if (!j.ok) {
      failed = w.where
        ? {
            headline: `in ${w.where}: ${j.headline}`,
            reason: `In ${w.where}: ${j.reason}`,
          }
        : j;
      break;
    }
    passed.push(
      w.where
        ? j.message.replace("Done gate ", `Done gate (${w.where}) `)
        : j.message,
    );
  }
  if (!failed) {
    for (const w of work) store.put("accepted", w.key, w.tree);
    store.take("blocks", session);
    store.take("gave-up", session);
    return say([...passed, ...notes].join("\n"));
  }
  if (gaveUp)
    return say(
      "Done gate ✗ still NOT DONE (unchanged since the agent gave up)",
    );
  const n = Number(store.get("blocks", session) ?? 0) + 1;
  if (n > MAX_BLOCKS) {
    store.take("blocks", session);
    store.put("gave-up", session, print);
    return say(
      `Done gate ✗ NOT DONE: the agent stopped after ${MAX_BLOCKS} tries, still failing: ${failed.headline}`,
    );
  }
  store.put("blocks", session, String(n));
  const told = `Done gate ✗ sent the agent back (${n}/${MAX_BLOCKS}): ${failed.headline}`;
  // Claude Code and Codex both document this for Stop; Codex ignores stdout on exit 2, losing Devesh's line.
  if (input.hook_event_name === "Stop")
    return process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason: failed.reason,
        systemMessage: told,
      }),
    );
  say(told); // TeammateIdle blocks only by exit 2
  process.stderr.write(failed.reason);
  process.exit(2);
}
