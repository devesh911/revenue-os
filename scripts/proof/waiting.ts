// Whether a step waits on Devesh. Each thing a step needs is an item of STATE.md → Waiting on Devesh: one that has
// not arrived makes the step wait while that item is unticked. Once STATE.md ticks it as delivered, its absence is
// a failure, and so is a need naming no item, so no step waits forever on something nobody tracks.

import { parseState, plain } from "../../docs/tracker/parse.js";
import type { Need } from "./step";

/** PURE: a Waiting item's name: its bold title, or its whole text when it has none. */
const nameOf = (text: string) => text.match(/^\*\*(.+?)\*\*/)?.[1] ?? text;

/**
 * PURE: a step's needs, STATE.md and the run's environment → what the step waits on, or why it fails; nothing when
 * everything it needs is here.
 */
export function waitsOn(
  needs: Need[],
  state: string,
  env: NodeJS.ProcessEnv,
): { waiting: string } | { failed: string } | undefined {
  const items = parseState(state).waiting;
  const waiting: string[] = [];
  for (const need of needs.filter((n) => !n.arrived(env))) {
    const item = items.find((i) => plain(nameOf(i.text)) === plain(need.item));
    if (!item)
      return {
        failed: `it needs "${need.item}", which STATE.md → Waiting on Devesh has no item for`,
      };
    if (item.done)
      return {
        failed: `it needs "${need.item}", which STATE.md → Waiting on Devesh has ticked as delivered, but this run does not have it`,
      };
    waiting.push(`"${need.item}"`);
  }
  if (waiting.length)
    return {
      waiting: `${waiting.join(" and ")} (STATE.md → Waiting on Devesh)`,
    };
}
