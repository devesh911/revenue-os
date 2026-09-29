#!/bin/sh
# Agent hooks (.claude/settings.json, .codex/hooks.json) run this to show the current cycle:
# `sh scripts/cycle-hook.sh --banner | --pin`. Hooks may start without bun on PATH, and a hook that
# fails has its output dropped, so this always prints something and exits 0. The hook's JSON input
# (with the agent's "cwd") stays on stdin for cycle.ts, so nothing here may read stdin.
cd "$(dirname "$0")/.." || exit 0
BUN=$(command -v bun || echo "$HOME/.bun/bin/bun")
"$BUN" scripts/cycle.ts "$1" 2>/dev/null ||
  echo "CYCLE UNKNOWN: could not run scripts/cycle.ts. Read ROADMAP.md (the current slice) and AGENTS.md (The loop) before any other work."
