# VPS + Cloudflare setup — the exact walkthrough (Devesh-only tasks)

Companion to T8 (topology), S3/S4 (the controls this implements), `docker/` (committed config),
and `orchestrator/state/CLOUD-SETUP-RUNBOOK.md` (Supabase/GitHub half, already done). Work top to
bottom. Where a value is secret it says WHERE to put it, never what it is.

## 0 · The picture (who talks to whom)

```
caller ↔ telephony ↔ Vapi (audio never touches us)
                      │  webhooks + mid-call tool calls (HTTPS)
                      ▼
Internet ──► Cloudflare edge ── WAF · rate limits · Transform Rule adds X-Edge-Auth ──► VPS
                 │                                                                      │
                 │ (orange-cloud DNS: api.<domain>)                     Caddy :443 ── verifies
                 │                                                     X-Edge-Auth ──► worker :8080
   browser ──► console.<domain>  = Cloudflare Pages (static SPA)                       │
   browser ──► www.<domain>      = Cloudflare Pages (Astro, when apps/www exists)      ▼
                                                                        Supabase Mumbai (Postgres/Auth)
```

Three properties, one sentence each: the **worker+harness is invisible** (origin answers only
Cloudflare — IP allowlist AND header check, S3.3); the **console/www are static files on Pages**
(nothing to hack on our origin, deploys need zero GitHub secrets); **state lives in Supabase**
(the VPS is stateless — destroy and rebuild it any time without data loss).

## 1 · VPS: what to buy (exact)

| Item | Choice | Why |
|---|---|---|
| Provider/region | **Vultr Mumbai** (first choice) or DigitalOcean Bangalore BLR1 | Co-located with Supabase `ap-south-1` → worker↔DB ~1–3ms; T26.5's 800ms p95 tool budget is why India is non-negotiable (T8) |
| Size | **1 vCPU · 2GB RAM · 50GB+ NVMe** (~$12/mo — Vultr `vc2-1c-2gb` or DO Basic 1/2GB) | Runs exactly two containers (worker + Caddy). Bun worker idles ~150–300MB; 2GB gives headroom for image pull + old/new container overlap during deploys. **1GB will OOM during pulls — don't.** The box never builds images (CI does), so CPU is nearly idle |
| OS | **Ubuntu 24.04 LTS** | unattended-upgrades + Docker docs assume it; boring is correct |
| Extras | IPv4; skip provider backups (stateless box); enable provider firewall if offered | Backups of a stateless box are noise; the firewall shows up in §3 |

Scale trigger (not before): sustained >70% RAM or pg-boss queue latency climbing → 2 vCPU/4GB
(~$24). Nothing in the architecture changes — same image, bigger box.

## 2 · VPS first-boot hardening (S3.1/S3.2/S3.4) — ~20 minutes, one pass

SSH in as root once, then never again:

```bash
adduser deploy && usermod -aG sudo deploy
rsync -a ~/.ssh /home/deploy/ && chown -R deploy:deploy /home/deploy/.ssh
# /etc/ssh/sshd_config.d/hardening.conf:
#   PasswordAuthentication no
#   PermitRootLogin no
systemctl restart ssh
apt update && apt install -y ufw fail2ban unattended-upgrades
ufw default deny incoming; ufw allow 443/tcp; ufw allow from <YOUR_HOME_IP> to any port 22 proto tcp
ufw enable
dpkg-reconfigure -plow unattended-upgrades   # security patches auto-apply (S3.4)
# Docker (official repo, not snap):
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
# 2GB swap (protects the 2GB box during image pulls):
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Port 80 stays CLOSED at the firewall: Cloudflare terminates browsers' TLS at the edge and speaks
443 to origin; Caddy's cert flow uses the TLS-ALPN challenge on 443. (If Let's Encrypt issuance
ever fights you, temporarily allow 80 from Cloudflare ranges only.)

## 3 · Deploy layout on the box (S3.7)

As `deploy`:

```bash
mkdir -p ~/app && cd ~/app        # gets docker/Caddyfile + docker-compose.yml (deploy.yml ships them)
# .env — mode 0600, owner deploy — values typed from the password manager, NEVER from a repo:
#   DATABASE_URL=            (Supabase Mumbai, app_service — session pooler URL)
#   SUPABASE_URL=
#   VAPI_WEBHOOK_SECRET=     (same value as the Vapi assistant server.secret)
#   EDGE_SHARED_SECRET=      (openssl rand -hex 32 — the SAME value goes in the Cloudflare
#                             Transform Rule in §5; this is the S3.3 header handshake)
#   CORS_ORIGINS=https://console.<domain>   (PR #31 — without this the console's API calls die
#                             in the browser exactly like the localhost bug we fixed)
chmod 600 .env
```

Edit `Caddyfile`: replace `api.example.com` with `api.<domain>`. Then `docker compose up -d`.
Verify from your laptop: `curl https://api.<domain>/health` → `{"ok":true}` **via Cloudflare**,
and `curl https://<VPS_IP>/health -k` → connection refused/403 (the wall works).

## 4 · Cloudflare: the one-time zone setup (do in this order)

Confusion-killer: **Cloudflare is two separate products for us.** (1) the **zone/proxy/edge** —
DNS with the orange cloud, WAF, Transform Rules — protects the VPS; (2) **Pages** — a static-site
host with its own GitHub integration — serves console/www and needs no VPS at all.

1. **Account basics (S4.4/S11.1):** 2FA on; delete/never-create legacy Global API Keys;
   registrar transfer-lock on the domain.
2. **Add the zone:** Cloudflare → Add site → `<domain>` → Free plan is fine → it lists two
   nameservers → set exactly those at your registrar → wait for "Active" (minutes to hours).
3. **SSL/TLS app:** mode **Full (strict)** (edge↔origin encrypted AND cert-verified — Caddy's
   Let's Encrypt cert satisfies it) · "Always Use HTTPS" ON · minimum TLS 1.2.
4. **DNS records (all orange-cloud/proxied — S4.1):**
   | Type | Name | Target | Note |
   |---|---|---|---|
   | A | `api` | VPS IP | the only record that touches the VPS |
   | CNAME | `console` | `<console-project>.pages.dev` | added via Pages "Custom domains" (it creates this for you) |
   | CNAME | `www` + apex | `<www-project>.pages.dev` | when apps/www exists (D26) |
   One-time check: search DNS-history sites for `<domain>` — if the VPS IP ever appeared
   unproxied, rotate the VPS IP (S4.1).
5. **Transform Rule (S3.3, the header half):** Rules → Transform → Modify Request Header →
   if hostname == `api.<domain>` → **set static header `X-Edge-Auth` = <the same
   openssl-rand value as the VPS .env EDGE_SHARED_SECRET>**. This is what makes "only
   Cloudflare" true even if someone finds the IP: firewall says only-CF-ranges, header says
   only-our-zone (another CF customer can't fake it).
6. **Cloud firewall (S3.3, the IP half):** in the PROVIDER's firewall (Vultr/DO, in front of
   ufw), restrict 443 to Cloudflare's published ranges (cloudflare.com/ips — they change rarely;
   re-check on the weekly cadence).
7. **WAF (S4.2):** Security → WAF → Managed rules ON (free tier: Cloudflare Managed Ruleset).
   Rate-limiting rule: path starts `/webhooks/` → generous (e.g. 300 req/10s per IP) — coarse
   DDoS insurance only; real limiting is app-level (S5.4). Leave `/auth/*` alone (Supabase's).
8. **Bot Fight Mode: OFF** (standing DECISION — zone-wide BFM would challenge Vapi webhooks and
   lose call events; revisit only if www gets its own zone).

## 5 · Cloudflare Pages: how the console (and later www) deploys

**Mental model: Pages is push-to-deploy.** No GitHub Action, no secrets, no wrangler. Cloudflare's
GitHub App watches the repo; every push to `main` that touches the watch paths triggers a build
in CLOUDFLARE'S builders; output goes to their CDN. PRs get free preview URLs.

Console project (Workers & Pages → Create → Pages → Connect to Git → grant the GitHub App access
to exactly this repo):

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `bun install && bun run --filter console build` |
| Build output directory | `apps/console/dist` |
| Root directory | `/` (repo root — the workspace needs it) |
| Watch paths | `apps/console/**`, `packages/shared/**` |
| Env vars (build-time, PUBLIC by design) | `VITE_SUPABASE_URL` = cloud project URL · `VITE_SUPABASE_ANON_KEY` = cloud anon key (designed-public, S7.3) · `VITE_API_URL` = `https://api.<domain>` |

First deploy lands on `<project>.pages.dev` — verify login there BEFORE any DNS. Then Pages →
Custom domains → add `console.<domain>` (it creates the proxied CNAME itself). The www/Astro
project is the same flow later: build `bun run --filter www build`, output `apps/www/dist`,
watch `apps/www/**`.

**The worker deploys the OTHER way** (for contrast, task 14 arms it): GitHub Actions builds the
Docker image in CI → ships it over SSH → `docker compose up -d` on the VPS → health-gate before
finishing. GitHub holds an SSH deploy key; Cloudflare is not involved in worker deploys at all.

## 6 · Smoke checklist (15 minutes, proves every wall)

- [ ] `curl https://api.<domain>/health` → 200 `{"ok":true}` (edge → Caddy → worker)
- [ ] `curl https://<VPS_IP>/health -k` → refused/timeout (provider firewall) — and if you
      temporarily open 443, Caddy answers 403 (header check holds by itself)
- [ ] `curl https://api.<domain>/ready` → 403/401 without the header (S5.9 — /ready is
      edge-internal; only /health is public)
- [ ] Console at `https://console.<domain>`: login works, org switcher populates (proves
      CORS_ORIGINS + VITE_API_URL are right)
- [ ] Vapi assistant `server.url` → `https://api.<domain>/webhooks/vapi/<orgId>` + shared secret
      set → test event lands as a `webhook_events` row (the task-8 REMOTE spike criteria)
- [ ] `docker compose logs worker | tail` shows pg-boss started, no error lines

## 7 · What this unblocks (STATE.md NEXT)

Task 14 (arm deploy.yml staging job) and the Vapi remote spike both start the moment §6 is green.
At go-live, `docs/runbooks/go-live.md` §4 re-audits everything this file set up.
