// Each slice's proof steps, by slice number: the one list `bun run proof <slice>` reads. A slice not listed has no
// proof yet, and its proof run fails, saying so.

import { steps as slice0 } from "./slice-0";
import { steps as slice1 } from "./slice-1";
import type { Step } from "./step";

export const SLICES: Record<number, Step[] | undefined> = {
  0: slice0,
  1: slice1,
};
