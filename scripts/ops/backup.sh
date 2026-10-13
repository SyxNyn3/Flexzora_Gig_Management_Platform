#!/usr/bin/env bash
# Flexzora nightly database backup.
#
# One-time setup on the VPS:
#   1. Install postgres client tools:
#        Ubuntu/Debian: sudo apt-get install -y postgresql-client
#   2. Copy this file to ~/flexzora-backup.sh and chmod +x it
#   3. Create ~/.flexzora-db.env with one line:
#        PGPASSWORD=<database password>
#      then chmod 600 ~/.flexzora-db.env
#   4. Add cron:  crontab -e
#        0 5 * * * ~/flexzora-backup.sh >> ~/flexzora-backup.log 2>&1
#
# Keeps 14 days of dumps, gzipped, in ~/backups/flexzora/.

set -euo pipefail

source ~/.flexzora-db.env
HOST="db.qgjtrosadftjrplubjaw.supabase.co"
DIR=~/backups/flexzora
FILE="$DIR/flexzora-$(date +%Y%m%d-%H%M).dump"

mkdir -p "$DIR"
pg_dump -h "$HOST" -U postgres -d postgres -Fc -f "$FILE"
gzip -9 "$FILE"

# rotate: keep last 14 days
find "$DIR" -name 'flexzora-*.dump.gz' -mtime +14 -delete

echo "[$(date -Is)] backup ok: $FILE.gz"
