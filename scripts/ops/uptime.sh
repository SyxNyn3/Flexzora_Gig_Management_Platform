#!/usr/bin/env bash
# Flexzora uptime + API heartbeat check.
#
# Setup:
#   1. Copy to ~/flexzora-uptime.sh, chmod +x
#   2. Cron every 5 min:
#        */5 * * * * ~/flexzora-uptime.sh >> ~/flexzora-uptime.log 2>&1
#   3. Optional alerting: set WEBHOOK to a Discord/Slack webhook URL and
#      uncomment the curl at the bottom.
#
# Writes one line per check; consecutive failures get flagged.

set -uo pipefail

SITE="https://syxnyn3.github.io/flexzora-live/"
API="https://qgjtrosadftjrplubjaw.supabase.co/rest/v1/"
STATE=~/flexzora-uptime.state
WEBHOOK=""   # paste a Discord/Slack webhook URL to enable alerts

fail=0
site_code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$SITE")
api_code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$API")
[ "$site_code" = "200" ] || fail=1
[ "$api_code" = "401" ] || [ "$api_code" = "200" ] || fail=1

ts=$(date -Is)
echo "[$ts] site=$site_code api=$api_code fail=$fail"

# alert on 3 consecutive failures, recover-notify once
prev=$(cat "$STATE" 2>/dev/null || echo 0)
if [ "$fail" = "1" ]; then
  echo $((prev + 1)) > "$STATE"
  if [ "$((prev + 1))" -ge 3 ] && [ -n "$WEBHOOK" ]; then
    curl -s -X POST "$WEBHOOK" -H 'Content-Type: application/json' \
      -d "{\"content\": \"Flexzora DOWN: site=$site_code api=$api_code ($ts)\"}" >/dev/null
  fi
else
  if [ "$prev" -ge 3 ] && [ -n "$WEBHOOK" ]; then
    curl -s -X POST "$WEBHOOK" -H 'Content-Type: application/json' \
      -d "{\"content\": \"Flexzora recovered ($ts)\"}" >/dev/null
  fi
  echo 0 > "$STATE"
fi
