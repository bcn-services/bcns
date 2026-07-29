#!/usr/bin/env bash
# Guards the infra defects fixed in this change. Each case failed before the fix.
# Run: bash infra/__tests__/infra.check.sh
set -uo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0; fail=0

ok()   { printf '  ok   %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

# Stub the two external commands backup.sh shells out to, plus curl, so a
# heartbeat ping is observable as a file instead of a network call.
mkdir -p "$work/bin"
printf '#!/bin/sh\nexit 0\n'                       > "$work/bin/pg_dump"
printf '#!/bin/sh\nexit 0\n'                       > "$work/bin/s3cmd"
printf '#!/bin/sh\necho pinged >> "$PINGFILE"\n'   > "$work/bin/curl"
chmod +x "$work/bin"/*
export PATH="$work/bin:$PATH"
export PINGFILE="$work/pinged"
export BCNS_HEARTBEAT_FILE="$work/heartbeat"
echo "https://example.invalid/ping" > "$BCNS_HEARTBEAT_FILE"

echo "backup.sh"

# 1. Empty config must NOT report success. bootstrap.sh creates this file empty,
#    so before the fix a fresh droplet pinged "healthy" having backed up nothing.
: > "$work/empty"
rm -f "$PINGFILE"
BCNS_BACKUP_CONF="$work/empty" bash "$here/backup.sh" >/dev/null 2>&1
check "empty config exits non-zero" "$?" "1"
check "empty config does not ping heartbeat" "$([ -f "$PINGFILE" ] && echo yes || echo no)" "no"

# 2. A final line with no trailing newline must still be processed. onboard-client.sh
#    tells you to *append* entries, which is exactly how you get no trailing newline.
printf 'alpha=postgres://a\nbeta=postgres://b' > "$work/no-newline"
rm -f "$PINGFILE"
out=$(BCNS_BACKUP_CONF="$work/no-newline" bash -x "$here/backup.sh" 2>&1)
# Assert each slug was actually seen, so this cannot pass by both being absent.
check "first line is processed" \
  "$(printf '%s' "$out" | grep -c 'alpha\.dump' | tr -d ' ' | awk '{print ($1>0)?"yes":"no"}')" "yes"
check "last line without trailing newline is processed" \
  "$(printf '%s' "$out" | grep -c 'beta\.dump' | tr -d ' ' | awk '{print ($1>0)?"yes":"no"}')" "yes"

# 3. Happy path pings the heartbeat.
printf 'alpha=postgres://a\n' > "$work/one"
rm -f "$PINGFILE"
BCNS_BACKUP_CONF="$work/one" bash "$here/backup.sh" >/dev/null 2>&1
check "successful run exits zero" "$?" "0"
check "successful run pings heartbeat" "$([ -f "$PINGFILE" ] && echo yes || echo no)" "yes"

# 4. Missing config is an error, not a silent success.
BCNS_BACKUP_CONF="$work/nope" bash "$here/backup.sh" >/dev/null 2>&1
check "missing config exits non-zero" "$?" "1"

echo "onboard-client.sh argument validation"

# Values reach the nginx vhost, so a ';' must never survive validation.
try() { bash "$here/onboard-client.sh" "$1" "$2" "$3" >/dev/null 2>&1; echo $?; }
check "rejects injection in domain" "$(try good 3000 'ex.com; return 200')" "1"
check "rejects injection in port"   "$(try good '3000; rm -rf /' ex.com)"   "1"
check "rejects non-numeric port"    "$(try good abcd ex.com)"               "1"
check "rejects privileged port"     "$(try good 80 ex.com)"                 "1"
check "rejects uppercase slug"      "$(try BAD 3000 ex.com)"                "1"
check "rejects wrong arg count"     "$(bash "$here/onboard-client.sh" only-one >/dev/null 2>&1; echo $?)" "1"

echo "syntax"
for f in "$here"/*.sh; do
  bash -n "$f" 2>/dev/null && ok "$(basename "$f") parses" || bad "$(basename "$f") syntax error"
done

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
