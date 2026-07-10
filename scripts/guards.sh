#!/usr/bin/env bash
# CI guards — task 11 (T14/S12.1 parity). Run locally: bun run guards
#
# S1.2 — the Supabase service-role key/name must never appear in app code. Role-name
#        grants inside supabase/migrations are legitimate SQL, and docs/ discusses the
#        control itself — both live outside the scanned surface (apps, packages,
#        services, scripts, docker). The needle is assembled at runtime so this file
#        never contains the literal and stays inside the scanned surface itself.
# S7.3 — the console bundle ships zero secret-shaped strings. CI builds dist/ with dummy
#        VITE_ values, so ANY JWT-shaped hit is a leak. A local dist/ built with the real
#        (designed-public) anon key will trip the JWT pattern — rebuild with dummy values.
set -u
fail=0
SR='service_''role'
JWT_HEAD='eyJ''hbGciOi'

echo "guard S1.2 · service-role string in app code"
hits="$(grep -rn --exclude-dir=node_modules --exclude-dir=dist --exclude='.env*' \
  "$SR" apps packages services scripts docker 2>/dev/null || true)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  echo "  FAIL — S1.2: that string belongs in CI secrets only, never in app code"
  fail=1
else
  echo "  PASS"
fi

DIST="apps/console/dist"
if [ -d "$DIST" ]; then
  echo "guard S7.3 · secret-shaped strings in console dist/"
  hits="$(grep -rnoE "sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|$SR|$JWT_HEAD" "$DIST" 2>/dev/null | head -20 || true)"
  if [ -n "$hits" ]; then
    printf '%s\n' "$hits"
    echo "  FAIL — S7.3: secret-shaped string in the console bundle"
    fail=1
  else
    echo "  PASS"
  fi
else
  echo "guard S7.3 · skipped (no $DIST — CI builds it with dummy env first)"
fi

exit "$fail"
