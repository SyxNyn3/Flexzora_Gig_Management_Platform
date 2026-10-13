# VPS Setup — one box, all operations

> **STATUS: LIVE (2026-10-14)** — Deployed and verified on the existing Contabo
> VPS (`contabo-vps` ssh alias → 167.86.115.101, Tailscale 100.118.148.105,
> 11 GB RAM / 6 cores / 168 GB free). All 8 trading-stack containers Up ≥7 days,
> actual memory ~800 MB total (limits are caps). Flexzora ops layer live:
> nightly `pg_dump` cron (05:00 → `/root/backups/flexzora/`, 14-day rotation,
> first backup verified 367 KB) + 5-min uptime cron (site + Supabase heartbeat).
> SSH key auth already on this machine — no user input was needed.

Target: a single VPS hosting **Prop Firm Reaper** (trading stack) + **Flexzora
ops** (nightly DB backups, uptime monitor, n8n automations). The Prop Firm
Reaper `docker-compose.yml` was already designed for this — it expects
`/opt/sovereign-portal/` paths and binds Postgres to a Tailscale IP.

**Notes learned from the live deploy:**
- Supabase runs Postgres 17 → install `postgresql-client-17` from the PGDG apt
  repo (Ubuntu's default 16.x pg_dump fails with version mismatch).
- `~/.flexzora-db.env` needs `export PGPASSWORD=...` — unexported vars don't
  reach pg_dump.
- Sizing guidance below overestimates: real usage ~800 MB total. An 8 GB box
  would run everything including ollama.

## 0. Sizing

| Component | RAM |
|---|---|
| n8n | 3 GB |
| Postgres ×2 (outreach + hermes) | 2.5 GB |
| outreach-crawler | 1.5 GB |
| quant-terminal | 2.5 GB |
| quant-bot | 1.5 GB |
| ollama (local LLM) | 6.5 GB |
| command-center + OS + Flexzora cron | ~1 GB |
| **Total with ollama** | **~19 GB → 24 GB VPS or skip ollama** |
| **Total without ollama** | **~12 GB → 16 GB VPS** |

Recommendation: **16 GB VPS** (e.g. Hetzner CCX23/CPX41, ~$30/mo) and use a
hosted LLM endpoint instead of local ollama (`LLM_BASE_URL` env already
parameterized). If budget is tight: 8 GB runs bot + terminal + n8n with ollama,
outreach-db, and hermes trimmed — decide before provisioning, don't resize later.

## 1. Base provisioning (~15 min)

```bash
# as root
apt update && apt -y upgrade
apt -y install ufw fail2ban unattended-upgrades curl git

# non-root operator
adduser ops && usermod -aG sudo ops
mkdir -p /home/ops/.ssh && cp ~/.ssh/authorized_keys /home/ops/.ssh/
chown -R ops:ops /home/ops/.ssh && chmod 700 /home/ops/.ssh

# firewall: ssh only — everything else via Tailscale (below)
ufw allow OpenSSH && ufw --force enable

# disable password ssh + root login
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload sshd

# docker
curl -fsSL https://get.docker.com | sh && usermod -aG docker ops
```

## 2. Tailscale (private access — no exposed ports)

The compose file binds `hermes-db` to `${TS_IP}` — that's the Tailscale
interface. n8n (:5678), terminal (:3000), command-center (:8080) should never
be public; access them over Tailscale from the user's laptop.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up                    # prints auth URL — user clicks once, approves
tailscale ip -4                 # → TS_IP for .env
tailscale serve --bg http://localhost:3000   # optional: https URL for terminal
```

## 3. Prop Firm Reaper deploy

```bash
# sync project (from the Windows machine — agent runs rsync/git over ssh)
# source: "Project Devin's Way/Prop Firm Reaper/" → /opt/sovereign-portal/app
mkdir -p /opt/sovereign-portal && chown ops:ops /opt/sovereign-portal
rsync -az --exclude node_modules --exclude __pycache__ \
  "Prop Firm Reaper/" ops@<VPS_IP>:/opt/sovereign-portal/app/

# on VPS: create .env (secrets stay on VPS, never in chat/git)
cd /opt/sovereign-portal/app
cat > .env <<EOF
DB_PASSWORD=$(openssl rand -hex 24)
HERMES_DB_PASSWORD=$(openssl rand -hex 24)
TERMINAL_PASSWORD=<set-by-user>
DASHBOARD_TOKEN=$(openssl rand -hex 24)
TS_IP=$(tailscale ip -4)
TYPESAFE_API_KEY=<from local .env>
TYPESAFE_BASE_URL=<from local .env>
HERMES_DSN=postgresql://hermes:<HERMES_DB_PASSWORD>@hermes-db:5432/hermes
JEV_MODE=shadow
STRATEGY=martin
MARTIN_SYMBOLS=BTCUSDT
LLM_BASE_URL=<hosted endpoint or http://ollama:11434/v1>
EOF
chmod 600 .env

docker compose up -d --build
docker compose ps   # all Up
```

Trading-bot envs to verify with the user before `JEV_MODE` leaves `shadow`:
API keys, symbol set, `JEV_MIN_PROB`. **Shadow mode first — always.**

## 4. Flexzora ops layer

Scripts already in repo: `scripts/ops/backup.sh`, `scripts/ops/uptime.sh`.

```bash
mkdir -p /opt/flexzora-ops && cd /opt/flexzora-ops
# copy scripts/ops/* here (rsync with the repo, or curl raw from private repo)

# .env (chmod 600)
SUPABASE_DB_HOST=db.qgjtrosadftjrplubjaw.supabase.co
SUPABASE_DB_PASSWORD=<from .env.local>
BACKUP_DIR=/opt/flexzora-ops/backups
UPTIME_URL=https://syxnyn3.github.io/flexzora-live/
ALERT_WEBHOOK=<n8n webhook or discord/slack webhook — set when wired>

# cron (crontab -e as ops)
0 5 * * *  /opt/flexzora-ops/backup.sh  >> /opt/flexzora-ops/backup.log 2>&1
*/5 * * * * /opt/flexzora-ops/uptime.sh >> /opt/flexzora-ops/uptime.log 2>&1
```

Offsite copy: `rclone` the backup dir to Backblaze B2 / Cloudflare R2 (free
tier) — same due-diligence rule applies, pick per `vendor-options.md`.

## 5. n8n automations (Mark's lane)

`outreach-n8n` is already in the compose stack (:5678, Tailscale-only).
Flexzora workflows to build there:
- waitlist signup → welcome sequence (once Resend key exists)
- `demo_requests` new row → founder notification
- uptime.sh alert → notification
- weekly metrics digest (the waitlist-metrics automation Mark started)

## 6. Verify before calling done

- [ ] `docker compose ps` — all services Up ≥10 min
- [ ] quant-bot logs show market data flowing, `JEV_MODE=shadow`
- [ ] `pg_dump` backup file appears in `/opt/flexzora-ops/backups/` after first cron
- [ ] `curl -I https://syxnyn3.github.io/flexzora-live/` 200 from uptime.sh
- [ ] `tailscale serve` URL loads terminal; nothing else reachable from public IP
- [ ] `nmap` from outside: only port 22 open

## 7. What can NOT be automated

- VPS purchase itself (user's card) + initial SSH credentials to us
- Tailscale one-time browser approval
- Trading API keys — user pastes into .env or confirms transfer from local env
