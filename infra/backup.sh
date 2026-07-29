#!/usr/bin/env bash
# Nightly pg_dump of every client Supabase project -> DO Spaces.
# Reads /etc/bcns/backup-dbs (root-only, mode 600): one 'slug=postgres://...' per line.
# Retention: 30-day lifecycle rule on the bucket's backups/ prefix (set in DO console).
set -euo pipefail

BUCKET="${BCNS_BUCKET:-s3://bcns-backups}"
# Paths are overridable so infra/__tests__ can exercise this without root.
conf="${BCNS_BACKUP_CONF:-/etc/bcns/backup-dbs}"
heartbeat="${BCNS_HEARTBEAT_FILE:-/etc/bcns/heartbeat-url}"
day=$(date +%F)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

[ -r "$conf" ] || { echo "missing/unreadable $conf" >&2; exit 1; }

fail=0
done_count=0
# `|| [ -n "$slug" ]` catches a final line with no trailing newline — read
# returns false on it, which would otherwise drop that client silently.
while IFS='=' read -r slug url || [ -n "$slug" ]; do
  [ -z "$slug" ] || [ "${slug:0:1}" = "#" ] && continue
  if pg_dump --no-owner --format=custom --file="$tmp/$slug.dump" "$url" &&
     s3cmd put "$tmp/$slug.dump" "$BUCKET/backups/$slug/$day.dump" >/dev/null; then
    rm -f "$tmp/$slug.dump"
    done_count=$((done_count + 1))
  else
    echo "backup FAILED for $slug" >&2
    fail=1
  fi
done < "$conf"

# Backing up nothing is not success. Without this, a droplet whose backup-dbs is
# still empty pings the heartbeat every night and the monitor reads "healthy".
if [ "$done_count" -eq 0 ]; then
  echo "backup FAILED: no databases in $conf — nothing was backed up" >&2
  fail=1
fi

# Dead-man's switch: ping the UptimeRobot heartbeat only on full success, so a
# silently failing backup becomes an alert instead of a surprise at restore time.
if [ "$fail" -eq 0 ] && [ -s "$heartbeat" ]; then
  curl -fsS "$(cat "$heartbeat")" >/dev/null || true
fi
exit "$fail"
