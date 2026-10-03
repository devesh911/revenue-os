#!/usr/bin/env bash
# The service-role guard (docs/security.md S1.2): the Supabase service-role key/name must never appear in app
# code. Role-name grants inside supabase/migrations are legitimate SQL, and docs/ discusses the control itself —
# both live outside the scanned surface (apps, packages, services, scripts, docker). The needle is assembled at
# runtime so this file never contains the literal and stays inside the scanned surface itself.
set -u
SR='service_''role'

echo "guard S1.2 · service-role string in app code"
hits="$(grep -rn --exclude-dir=node_modules --exclude-dir=dist --exclude='.env*' \
  "$SR" apps packages services scripts docker 2>/dev/null || true)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  echo "  FAIL — S1.2: that string belongs in CI secrets only, never in app code"
  exit 1
fi
echo "  PASS"
