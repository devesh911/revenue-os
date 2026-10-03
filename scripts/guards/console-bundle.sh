#!/usr/bin/env bash
# The console-bundle guard (docs/security.md S7.3): the console bundle ships zero secret-shaped strings. CI builds
# dist/ with dummy VITE_ values, so ANY JWT-shaped hit is a leak. A local dist/ built with the real (designed-public)
# anon key will trip the JWT pattern — rebuild with dummy values. The needles are assembled at runtime so this
# file never contains them.
set -u
SR='service_''role'
JWT_HEAD='eyJ''hbGciOi'
DIST="apps/console/dist"

if [ ! -d "$DIST" ]; then
  echo "guard S7.3 · skipped (no $DIST — CI builds it with dummy env first)"
  exit 0
fi
echo "guard S7.3 · secret-shaped strings in console dist/"
hits="$(grep -rnoE "sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|$SR|$JWT_HEAD" "$DIST" 2>/dev/null | head -20 || true)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  echo "  FAIL — S7.3: secret-shaped string in the console bundle"
  exit 1
fi
echo "  PASS"
