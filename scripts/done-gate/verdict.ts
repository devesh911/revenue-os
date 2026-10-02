// Proven or not: the done rules, every check on this exact code, and for product code the verifier's ruling
// on it.

import { noDocker, runChecks } from "./checks";
import { isProduct, listed, rulesOn } from "./rules";
import type { Snap } from "./snapshot";
import type { Store } from "./store";

type Proof =
  | { ok: true; checks: string; notes: string[] }
  | { ok: false; headline: string; reason: string };
export type Ruling = {
  verdict: "pass" | "fail" | "cannot-verify";
  note: string;
};

const NEED_VERIFIER = `You can't finish yet: product code changed, and nobody independent has seen it work.
Run the verifier agent (Agent tool, subagent_type "verifier"). Give it Devesh's request word for word, what you changed, and how you believe it can be seen working. If it rules FAIL, fix what it found and run it again.
If you are stopping to ask Devesh a question rather than finishing, run \`bun run gate pause "<the question>"\` and stop again.`;

/** Rules + checks: everything a machine can prove. Checks are cached per exact code; `cachedOnly` runs none. */
export async function prove(
  snap: Snap,
  store: Store,
  cachedOnly = false,
): Promise<Proof> {
  const { problems, notes } = rulesOn(snap);
  if (problems.length)
    return {
      ok: false,
      headline: `${problems.length} rule problem(s), first: ${problems[0]}`,
      reason: `You can't finish yet: your change breaks the done rules.\n${listed(problems)}`,
    };
  const cached =
    store.get("checked", snap.tree) ??
    (noDocker() ? store.get("partial", snap.tree) : undefined);
  if (cached) return { ok: true, checks: cached, notes };
  if (cachedOnly)
    return { ok: false, headline: "the checks have not passed", reason: "" };
  const r = await runChecks(snap.repo);
  if (!r.ok)
    return {
      ok: false,
      headline: r.text.split("\n")[0] ?? "a check failed",
      reason: `You can't finish yet: ${r.text}\nFix the cause. Never skip, silence or weaken a check to get past it.`,
    };
  store.put(r.complete ? "checked" : "partial", snap.tree, r.text); // a partial run never passes a full one
  return { ok: true, checks: r.text, notes };
}

/** `codex`: the agent is Codex, which has no verifier agent, so it is never sent back to run one. */
export async function judge(
  snap: Snap,
  store: Store,
  codex: boolean,
  cachedOnly = false,
): Promise<Verdict> {
  const proof = await prove(snap, store, cachedOnly);
  if (!proof.ok) return proof;
  return rule(snap.tree, proof, snap.files.some(isProduct), store, codex);
}

type Verdict =
  | { ok: true; message: string }
  | { ok: false; headline: string; reason: string };

/** Proven by machine; does the change also need, and have, the verifier's ruling on this exact code? */
function rule(
  tree: string,
  proof: { checks: string; notes: string[] },
  product: boolean,
  store: Store,
  codex: boolean,
): Verdict {
  const told = proof.notes.length ? ` · ⚠ ${proof.notes.join(" · ")}` : "";
  if (!product)
    return {
      ok: true,
      message: `Done gate ✓ ${proof.checks} (no product code changed, so no verifier needed)${told}`,
    };
  const ruling = parseRuling(store.get("verdict", tree));
  if (!ruling && codex)
    return {
      ok: true,
      message: `Done gate ⚠ checks green (${proof.checks}), NOT independently verified (Codex has no verifier agent): ask Claude to run the verifier, or check it yourself${told}`,
    };
  if (!ruling)
    return {
      ok: false,
      headline: "product code changed and nobody independent has seen it work",
      reason: NEED_VERIFIER,
    };
  if (ruling.verdict === "cannot-verify")
    return {
      ok: true,
      message: `Done gate ⚠ NOT verified: the verifier needs something only you can provide: ${ruling.note} (checks green: ${proof.checks})${told}`,
    };
  if (ruling.verdict === "fail")
    return {
      ok: false,
      headline: `the verifier ruled FAIL: ${ruling.note}`,
      reason: `You can't finish yet: the verifier ruled FAIL: ${ruling.note}\nFix what it found, then run the verifier again. It must rule on the code exactly as you leave it.`,
    };
  return {
    ok: true,
    message: `Done gate ✓ ${proof.checks} · verifier PASS: ${ruling.note}${told}`,
  };
}

export function parseRuling(raw: string | undefined): Ruling | undefined {
  try {
    const r = JSON.parse(raw ?? "") as Ruling;
    return ["pass", "fail", "cannot-verify"].includes(r.verdict) && r.note
      ? r
      : undefined;
  } catch {
    return undefined;
  }
}
