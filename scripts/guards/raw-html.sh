#!/usr/bin/env bash
# The raw-HTML guard: no console code puts a string into the page as HTML, where a lead's message or a transcript
# could run as script; React renders text, which can't. It reads text, so React's prop counts however it is passed (a
# spread object included), and so do the browser's own ways: innerHTML, outerHTML, insertAdjacentHTML,
# document.write and createContextualFragment. A name built from pieces (el["inner" + "HTML"]) gets past it.
# Proven by scripts/guards-sdk-raw-html.test.ts.
set -u

echo "guard · raw HTML in console code"
hits="$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.mjs' \
  --include='*.cjs' 'dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment' \
  apps/console/src 2>/dev/null || true)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  echo "  FAIL — render the text as text (React escapes it); never put a string into the page as HTML"
  exit 1
fi
echo "  PASS"
