// The verifier agent may finish only after recording its ruling on the code this session is working on.

import { rootsOf } from "./checkouts";
import type { HookInput } from "./hook-io";
import { snapshot } from "./snapshot";
import type { Store } from "./store";
import { parseRuling, type Ruling } from "./verdict";

/**
 * The verifier may finish only after recording a ruling (`bun run gate verdict`, in the checkout it judged)
 * while it ran, on code this session is working on. If it recorded several on the same code, a FAIL stands.
 */
export function verifierDone(
  repo: string,
  input: HookInput,
  store: Store,
  session: string,
) {
  const me = `${session}-${input.agent_id ?? "main"}`;
  const since = Number(store.get("verifier", me) ?? Date.now());
  const mine = new Set(
    rootsOf(repo, store, session, input.cwd).roots.flatMap((r) => {
      try {
        return [snapshot(r, false).tree];
      } catch {
        return []; // a checkout that can't be read holds no code to rule on
      }
    }),
  );
  let promoted = 0;
  for (const { key } of store.list("pending")) {
    if (!mine.has(key)) continue;
    const fresh = (store.get("pending", key) ?? "")
      .split("\n")
      .map((l) => parseRuling(l) as (Ruling & { at?: number }) | undefined)
      .filter((r) => r && (r.at ?? 0) >= since) as Ruling[];
    const pick =
      fresh.find((r) => r.verdict === "fail") ??
      fresh.find((r) => r.verdict === "cannot-verify") ??
      fresh.at(-1);
    if (!pick) continue;
    store.put(
      "verdict",
      key,
      JSON.stringify({ verdict: pick.verdict, note: pick.note }),
    );
    store.take("pending", key);
    promoted++;
  }
  if (promoted) return store.take("verifier", me);
  process.stderr.write(
    'Before you finish, record your ruling on the code exactly as it is now, from the checkout that holds it:\nbun run gate verdict pass|fail "<one line: what you saw>"\nor, only when seeing it work needs something only Devesh has: bun run gate verdict cannot-verify "<exactly what he must provide>"',
  );
  process.exit(2);
}
