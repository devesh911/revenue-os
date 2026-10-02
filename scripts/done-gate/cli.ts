// `bun run gate` and `bun run see` from a terminal: every check, the rules alone, the tests, a pause, a ruling,
// or what a signed-in person sees.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserEnv, run, tail } from "./checks";
import { git } from "./git";
import { listed, rulesOn } from "./rules";
import { onSharedStack } from "./shared-stack";
import { type Snap, snapshot } from "./snapshot";
import { Store, stateDir } from "./store";
import { allTestsRun } from "./tests-ran";
import { parseRuling, prove, type Ruling } from "./verdict";

const USAGE = `usage: bun run gate [rules [--base <ref>] | tests [e2e] | pause "<question>" | verdict pass|fail "<what you saw>" | verdict cannot-verify "<what only Devesh can provide>"]
       bun run see <console path> [more paths]   (":org" in a path becomes the seeded workspace)`;

export async function cli(cmd: string, args: string[]) {
  const repo = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const store = new Store(stateDir(repo));
  const text = args.join(" ").trim();
  if (cmd === "check") {
    const snap = snapshot(repo);
    const proof = await prove(snap, store);
    const ruling = parseRuling(store.get("verdict", snap.tree));
    console.log(
      proof.ok
        ? `Done gate ✓ ${proof.checks}${proof.notes.map((n) => `\n⚠ ${n}`).join("")}`
        : `Done gate ✗ ${proof.reason}`,
    );
    console.log(
      ruling
        ? `Verifier on this exact code: ${ruling.verdict.toUpperCase()}: ${ruling.note}`
        : "Verifier: no ruling on this exact code yet.",
    );
    process.exit(proof.ok ? 0 : 1);
  } else if (
    cmd === "rules" &&
    (!args.length || (args[0] === "--base" && args[1] && args.length === 2))
  ) {
    const base = args[1] ?? "origin/main";
    let snap: Snap;
    try {
      snap = snapshot(repo, true, base);
    } catch (e) {
      console.error(
        `Done rules ✗ could not compare the change with ${base}: ${String(e).split("\n")[0]}`,
      );
      process.exit(2);
    }
    const { problems, notes } = rulesOn(snap);
    console.log(
      (problems.length
        ? `Done rules ✗ ${problems.length} problem(s) in the change since ${base}:\n${listed(problems)}`
        : `Done rules ✓ nothing in the change since ${base} breaks them`) +
        notes.map((n) => `\n⚠ ${n}`).join(""),
    );
    process.exit(problems.length ? 1 : 0);
  } else if (
    cmd === "tests" &&
    (!args.length || (args[0] === "e2e" && args.length === 1))
  ) {
    process.exit(allTestsRun(repo, args[0] === "e2e"));
  } else if (cmd === "pause" && text) {
    store.put("pause", snapshot(repo, false).tree, text);
    console.log(
      "Paused. Your next stop reaches Devesh as a question, with the change marked NOT verified.",
    );
  } else if (
    cmd === "verdict" &&
    ["pass", "fail", "cannot-verify"].includes(args[0] ?? "") &&
    args.slice(1).join(" ").trim()
  ) {
    const ruling: Ruling = {
      verdict: args[0] as Ruling["verdict"],
      note: args.slice(1).join(" ").trim(),
    };
    store.add(
      "pending",
      snapshot(repo, false).tree,
      `${JSON.stringify({ ...ruling, at: Date.now() })}\n`,
    );
    console.log(
      `Ruling noted: ${ruling.verdict.toUpperCase()}: ${ruling.note}\nIt counts only when it comes from the verifier agent, and only for the code exactly as it is now.`,
    );
  } else if (cmd === "see" && text) {
    const out = mkdtempSync(join(tmpdir(), "revenue-os-see-"));
    const r = await onSharedStack(repo, async () =>
      run(repo, ["bun", "run", "local", "bun", "run", "e2e", "see.e2e.ts"], {
        ...(await browserEnv()),
        SEE_PATHS: text,
        SEE_OUT: out,
      }),
    ).catch((e: Error) => ({ status: 1, out: e.message }));
    console.log(tail(r.out, 30));
    console.log(
      r.status === 0
        ? `\nSaved in ${out}: per path, a .png (the page) and a .txt (URL, visible text, every error).`
        : "\nsee failed; the output above says why.",
    );
    process.exit(r.status);
  } else {
    console.error(USAGE);
    process.exit(2);
  }
}
