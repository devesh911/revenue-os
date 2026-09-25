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
# S4.1 — the origin IP is never published (lessons 2026-09-25: the VPS address sat in
#        tracked files; gitleaks hunts credentials, not addresses). Any PUBLIC IPv4 literal
#        in a tracked file fails. Allowed: loopback, 0.0.0.0, private (10/8, 172.16/12,
#        192.168/16), link-local, and the documentation ranges (RFC 5737). Hits print as
#        file:line only — the address itself never reaches a log.
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

echo "guard S4.1 · public IPv4 literal in tracked files"
O='(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)' # one octet, 0-255
END='(?!\w|\.\d)'                       # no word or 5th number follows; a full stop may
ALLOWED="(?:127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|0\.0\.0\.0$END)"
# Path allowlist: IntentEvidence.tsx's handset icon is an SVG path whose compact numbers
# (1.2 .3 .4 written with no spaces) read exactly like an address — no regex can tell them
# apart. Excusing a path hides any future address in it, so keep this list to that one file.
hits="$(git grep -nIP "(?<![\w.])(?!$ALLOWED)$O(?:\.$O){3}$END" -- \
  ':!apps/www/src/visuals/IntentEvidence.tsx')"
rc=$?
if [ "$rc" -gt 1 ]; then
  echo "  FAIL — S4.1: git grep exited $rc, so nothing was scanned"
  fail=1
elif [ -n "$hits" ]; then
  printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'
  echo "  FAIL — S4.1: public IPv4 address at the lines above (masked); use 192.0.2.x in docs, a secret or env var in config"
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
