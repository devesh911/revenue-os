#!/usr/bin/env bash
# The Anthropic SDK guard (docs/tech-stack.md T19): no package uses an @anthropic-ai module, because the model
# adapter is raw fetch (packages/harness/src/llm/anthropic.ts). It reads text, so the module's name in quotes counts
# however it is loaded (import, export, require, import(), any subpath) and as a dependency in a package.json; the
# name in a comment's prose does not. Proven by scripts/guards-sdk-raw-html.test.ts.
set -u
q="[\"'\`]"

echo "guard · an @anthropic-ai module in packages"
hits="$(grep -rnE --exclude-dir=node_modules --exclude-dir=dist \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.mjs' --include='*.cjs' \
  --include='package.json' "${q}@anthropic-ai(/|${q})" packages 2>/dev/null || true)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  echo "  FAIL — no Anthropic SDK in packages: call the model through packages/harness/src/llm/anthropic.ts (raw fetch)"
  exit 1
fi
echo "  PASS"
