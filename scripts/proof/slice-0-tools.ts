// Slice 0's proof: the hooks agents' tools run. With the gate's entry file missing they warn rather than go quiet,
// and the check before each command refuses what agents' own tools may not do. Commands are only handed to the
// gate's hook, as Claude Code hands it a tool call; none of them runs.

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bash, hook, said } from "./gate";
import { git, inScratch, sh } from "./scratch";
import type { Step } from "./step";

type Hooks = Record<string, { hooks?: { command?: string }[] }[]>;

/** Each hook command in `file`, as committed, that runs the gate's entry file. */
const gateCommands = (root: string, file: string) =>
  Object.values(
    (JSON.parse(git(root, "show", `HEAD:${file}`)) as { hooks?: Hooks })
      .hooks ?? {},
  )
    .flat()
    .flatMap((group) => group.hooks ?? [])
    .flatMap((h) =>
      h.command?.includes("scripts/done-gate.ts") ? [h.command] : [],
    );

export const hooksWarn: Step = {
  does: "With the gate's entry file missing (scripts/done-gate.ts, in a scratch checkout without it), runs each hook command .claude/settings.json and .codex/hooks.json give for the gate, and checks that each one warns instead of going quiet",
  check: ({ root }) => {
    const commands = [
      ...gateCommands(root, ".claude/settings.json"),
      ...gateCommands(root, ".codex/hooks.json"),
    ];
    if (!commands.length)
      throw new Error("no hook command in either file runs the gate");
    const empty = realpathSync(mkdtempSync(join(tmpdir(), "proof-no-gate-")));
    try {
      git(empty, "init", "-q"); // Codex finds the checkout with git
      const quiet = commands.filter((c) => {
        const r = sh(
          empty,
          ["sh", "-c", c],
          { CLAUDE_PROJECT_DIR: empty },
          "{}",
        );
        try {
          return !(JSON.parse(r.stdout).systemMessage as string).startsWith(
            "Done gate ⚠",
          );
        } catch {
          return true;
        }
      });
      if (quiet.length)
        throw new Error(
          `${quiet.length} of ${commands.length} went quiet, among them: ${quiet[0]}`,
        );
      const warning = JSON.parse(
        sh(
          empty,
          ["sh", "-c", commands[0] ?? ""],
          { CLAUDE_PROJECT_DIR: empty },
          "{}",
        ).stdout,
      ).systemMessage;
      return `all ${commands.length} hook commands warned: "${warning}"`;
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  },
};

export const agentToolsRefused: Step = {
  does: "Hands the gate's hook, as an agent's Bash tool would, an agent's attempt to push to the cloud database, read a `.env` file, read its GitHub login's token, post a commit status, publish a release or change a GitHub ruleset, and checks that each is refused while the loop's own reads go through",
  check: ({ root }) =>
    inScratch(root, ({ dir, main }) => {
      const refused = [
        "supabase db push",
        "supabase db push --db-url postgresql://postgres:x@db.example.invalid:5432/postgres",
        "cat .env",
        "cat apps/console/.env.local",
        "gh auth token",
        "gh auth status --show-token",
        `gh api -X POST repos/devesh911/revenue-os/statuses/${main} -f state=success -f context=checks`,
        "gh release create v1.0.0 --notes x",
        "gh api -X PUT repos/devesh911/revenue-os/rulesets/1 --input ruleset.json",
      ];
      const reads = ["gh pr view 7", "cat .env.example"];
      const through = refused.filter(
        (c) => !hook(dir, "PreToolUse", bash(c)).refused,
      );
      if (through.length) throw new Error(`let through: ${through.join("; ")}`);
      const stopped = reads.filter(
        (c) => hook(dir, "PreToolUse", bash(c)).refused,
      );
      if (stopped.length)
        throw new Error(
          `refused the loop's own reads too: ${stopped.join("; ")}`,
        );
      return `refused all ${refused.length}, each saying why (for \`${refused[0]}\`: ${said(hook(dir, "PreToolUse", bash(refused[0] ?? "")))}), and let ${reads.join(" and ")} through`;
    }),
};
