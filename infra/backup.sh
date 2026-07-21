#!/usr/bin/env bash
# Nightly pg_dump of every client Supabase project -> DO Spaces.
# Reads /etc/bcns/backup-dbs (root-only, mode 600): one 'slug=postgres://...' per line.
# Retention: 30-day lifecycle rule on the bucket's backups/ prefix (set in DO console).
set -euo pipefail

BUCKET="s3://bcns-backups"
conf=/etc/bcns/backup-dbs
day=$(date +%F)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail=0
while IFS='=' read -r slug url; do
  [ -z "$slug" ] || [ "${slug:0:1}" = "#" ] && continue
  if pg_dump --no-owner --format=custom --file="$tmp/$slug.dump" "$url" &&
     s3cmd put "$tmp/$slug.dump" "$BUCKET/backups/$slug/$day.dump" >/dev/null; then
    rm -f "$tmp/$slug.dump"
  else
    echo "backup FAILED for $slug" >&2
    fail=1
  fi
done < "$conf"

# Dead-man's switch: ping the UptimeRobot heartbeat only on full success, so a
# silently failing backup becomes an alert instead of a surprise at restore time.
if [ "$fail" -eq 0 ] && [ -s /etc/bcns/heartbeat-url ]; then
  curl -fsS "$(cat /etc/bcns/heartbeat-url)" >/dev/null || true
fi
exit "$fail"
