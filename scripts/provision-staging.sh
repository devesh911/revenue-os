#!/usr/bin/env bash
# provision-staging.sh — one-shot staging secret provisioning with zero hand-typed secrets.
#
# RUN THIS IN YOUR OWN TERMINAL (never from an agent session — AGENTS.md hard rail #1:
# secrets must not pass through chat). The script:
#   1. generates app_service password + EDGE_SHARED_SECRET + VAPI_WEBHOOK_SECRET (openssl, hex —
#      URL-safe and quote-safe by construction),
#   2. activates cloud app_service (ALTER ROLE ... LOGIN PASSWORD) via the session pooler,
#   3. writes ~/app/.env on the VPS over SSH (mode 600; secrets travel via stdin, never argv),
#   4. stores recovery copies in 1Password (`op`) or Bitwarden (`bw`) when the CLI is present —
#      otherwise prints WHERE each value now lives (never the values) so you can note them.
#
# You will be prompted for exactly ONE credential: the staging database admin password
# (Supabase dashboard → project settings → database). Nothing secret is ever echoed.
#
# Idempotent: re-running rotates all three generated secrets everywhere this script reaches.
# NOT touched here (need the domain / assistant id): Cloudflare Transform Rule and Vapi
# assistant server.secret — the script prints the exact follow-up for each.
set -euo pipefail

PROJECT_REF="ajtfillmkjhoffxllqja"
POOLER_HOST="aws-1-ap-south-1.pooler.supabase.com" # from the dashboard Connect dialog — never guess pooler hosts (aws-0 vs aws-1 differs per project)
VPS="deploy@168.144.147.90"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
CORS_ORIGINS="https://revenue-os-console.pages.dev"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

command -v psql >/dev/null || die "psql not found (brew install libpq && brew link --force libpq)"
command -v openssl >/dev/null || die "openssl not found"
ssh -o BatchMode=yes -o ConnectTimeout=8 "$VPS" true 2>/dev/null || die "SSH to $VPS failed — is the key in your agent? (ssh-add --apple-load-keychain)"

say "① Generating secrets (hex — no quoting/URL-encoding hazards)…"
APP_SERVICE_PW="$(openssl rand -hex 24)"
EDGE_SHARED_SECRET="$(openssl rand -hex 32)"
VAPI_WEBHOOK_SECRET="$(openssl rand -hex 32)"

say "② Activating cloud app_service (you'll be asked for the staging DB admin password)…"
read -r -s -p "  staging DB admin password (input hidden): " PG_ADMIN_PW; echo
PGPASSWORD="$PG_ADMIN_PW" psql -h "$POOLER_HOST" -p 5432 -U "postgres.${PROJECT_REF}" -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "alter role app_service with login password '${APP_SERVICE_PW}';" >/dev/null \
  || die "ALTER ROLE failed — wrong admin password, or pooler unreachable"
unset PG_ADMIN_PW
say "   app_service activated."

say "③ Writing ~/app/.env on the VPS (mode 600, via stdin)…"
ssh "$VPS" 'umask 077 && cat > ~/app/.env && chmod 600 ~/app/.env' <<ENV
DATABASE_URL=postgresql://app_service.${PROJECT_REF}:${APP_SERVICE_PW}@${POOLER_HOST}:5432/postgres
SUPABASE_URL=${SUPABASE_URL}
VAPI_WEBHOOK_SECRET=${VAPI_WEBHOOK_SECRET}
EDGE_SHARED_SECRET=${EDGE_SHARED_SECRET}
CORS_ORIGINS=${CORS_ORIGINS}
ENV
ssh "$VPS" 'ls -l ~/app/.env' | grep -q -- '-rw-------' || die ".env permissions are not 600"
say "   .env installed."

say "④ Recovery copies…"
store() { # store <item-name> <value>
  if command -v op >/dev/null 2>&1; then
    printf '%s' "$2" | op item create --category=password --title="$1" password[password]=- >/dev/null \
      && say "   1Password: $1" && return 0
  fi
  if command -v bw >/dev/null 2>&1 && bw status 2>/dev/null | grep -q '"status":"unlocked"'; then
    bw get template item | sed "s/\"name\": *\"[^\"]*\"/\"name\": \"$1\"/" \
      | jq --arg v "$2" '.login={"password":$v} | .type=1' | bw encode | bw create item >/dev/null \
      && say "   Bitwarden: $1" && return 0
  fi
  return 1
}
STORED=true
store "revenue-os staging app_service" "$APP_SERVICE_PW" || STORED=false
store "revenue-os EDGE_SHARED_SECRET" "$EDGE_SHARED_SECRET" || STORED=false
store "revenue-os VAPI_WEBHOOK_SECRET" "$VAPI_WEBHOOK_SECRET" || STORED=false
if [ "$STORED" = false ]; then
  say "   No password-manager CLI found. The ONLY copies are now in: VPS ~/app/.env (all three)"
  say "   + the live systems they get pasted into later. Acceptable for staging (recovery ="
  say "   re-run this script, which rotates everything); install 1Password/Bitwarden CLI to"
  say "   close the loop before go-live."
fi

say "⑤ Done. Follow-ups this script cannot reach yet:"
say "   · Domain day → Cloudflare Transform Rule X-Edge-Auth = the EDGE_SHARED_SECRET"
say "     (read it then with: ssh $VPS 'grep EDGE ~/app/.env')"
say "   · Vapi assistant server.secret = the VAPI_WEBHOOK_SECRET (same grep trick), set"
say "     together with server.url once the api domain exists."
say "   · Do NOT 'docker compose up' before the domain exists (Caddy needs a hostname)."
