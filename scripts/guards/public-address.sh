#!/usr/bin/env bash
# The public-address guard (docs/security.md S4.1): the origin IP is never published (lessons 2026-09-25: the VPS
# address sat in tracked files; gitleaks hunts credentials, not addresses). Any PUBLIC IPv4 literal in a tracked
# file fails. Allowed: loopback, 0.0.0.0, private (10/8, 172.16/12, 192.168/16), link-local, and the documentation
# ranges (RFC 5737). Hits print as file:line only — the address itself never reaches a log.
set -u

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
  exit 1
elif [ -n "$hits" ]; then
  printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'
  echo "  FAIL — S4.1: public IPv4 address at the lines above (masked); use 192.0.2.x in docs, a secret or env var in config"
  exit 1
fi
echo "  PASS"
