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
check "rejects six args"            "$(bash "$here/onboard-client.sh" a 3000 ex.com certbot next extra >/dev/null 2>&1; echo $?)" "1"

# The vhost heredoc needs root to emit, so assert on the template text instead.
# 00-default is a `return 444` catch-all: drop the www block and every www
# visitor gets a dropped connection the moment DNS cuts over, while the apex
# keeps looking healthy.
echo "onboard-client.sh vhost template"
vhost=$(cat "$here/onboard-client.sh")
case "$vhost" in
  *'server_name www.$domain;'*) ok "www vhost present" ;;
  *) bad "www vhost missing -- www would hit 00-default's return 444" ;;
esac
case "$vhost" in
  *'return 301 https://$domain\$request_uri;'*) ok "www redirects to apex, preserving the path" ;;
  *) bad "www block does not 301 to the apex with \$request_uri" ;;
esac

echo "onboard-client.sh ports registry (infra/ports.txt)"

reg="$work/ports.txt"
printf 'l2detailz 3100\nsb 3101\n' > "$reg"
tryp() { BCNS_PORTS_FILE="$reg" BCNS_RENDER_ONLY=1 bash "$here/onboard-client.sh" "$@" >/dev/null 2>&1; echo $?; }
check "refuses a slug missing from the registry"       "$(tryp ghost 3105 ghost.bcn-services.com)"   "1"
check "refuses a slug on a port other than registered" "$(tryp sb 3102 sb.bcn-services.com)"          "1"
check "refuses a port registered to another slug"      "$(tryp l2detailz 3101 l2details.com)"         "1"
check "accepts a registered slug/port pair"            "$(tryp sb 3101 sb.bcn-services.com)"          "0"
check "refuses when the registry file is missing"      "$(BCNS_PORTS_FILE=$work/none BCNS_RENDER_ONLY=1 bash "$here/onboard-client.sh" sb 3101 sb.bcn-services.com >/dev/null 2>&1; echo $?)" "1"
check "refuses an unknown cert mode"                   "$(tryp sb 3101 sb.bcn-services.com bogus)"    "1"
check "refuses a relative cert dir"                    "$(tryp sb 3101 sb.bcn-services.com certs/x)"  "1"
check "refuses a slug with a leading hyphen"           "$(tryp -sb 3101 sb.bcn-services.com)"         "1"
# Review fix: a commented-out registry line must not count as a registration.
printf '# mcp 3103 retired\nl2detailz 3100\nsb 3101\r\n' > "$reg"
check "registry ignores comment lines"                 "$(tryp mcp 3103 mcp.bcn-services.com)"        "1"
check "registry tolerates CRLF"                        "$(tryp sb 3101 sb.bcn-services.com)"          "0"
printf 'l2detailz 3100\nsb 3101\n' > "$reg"

# The committed registry itself: unique slugs, unique ports, every port in range.
regs=$(grep -v '^#' "$here/ports.txt" | grep -c .)
check "ports.txt slugs are unique" "$(grep -v '^#' "$here/ports.txt" | awk '{print $1}' | sort -u | wc -l | tr -d ' ')" "$regs"
check "ports.txt ports are unique" "$(grep -v '^#' "$here/ports.txt" | awk '{print $2}' | sort -u | wc -l | tr -d ' ')" "$regs"
check "ports.txt ports are 1024-65535" "$(grep -v '^#' "$here/ports.txt" | awk '$2<1024||$2>65535' | wc -l | tr -d ' ')" "0"
check "ports.txt pins l2detailz to 3100 (the live unit)" "$(awk '$1=="l2detailz"{print $2}' "$here/ports.txt")" "3100"

echo "onboard-client.sh app kind (5th arg) -- env seeding"

renderenv() { BCNS_PORTS_FILE="$reg" BCNS_RENDER_ONLY=env bash "$here/onboard-client.sh" "$@" 2>/dev/null; }
check "refuses an unknown app kind" \
  "$(BCNS_PORTS_FILE="$reg" BCNS_RENDER_ONLY=1 bash "$here/onboard-client.sh" sb 3101 sb.bcn-services.com certbot bogus-kind >/dev/null 2>&1; echo $?)" "1"

mcpenv=$(renderenv sb 3101 sb.bcn-services.com certbot mcp)
if printf '%s\n' "$mcpenv" | grep -qx '# SUPABASE_URL='; then ok "mcp kind seeds SUPABASE_URL"; else bad "mcp kind missing SUPABASE_URL"; fi
if printf '%s\n' "$mcpenv" | grep -qx '# SUPABASE_ANON_KEY='; then ok "mcp kind seeds SUPABASE_ANON_KEY"; else bad "mcp kind missing SUPABASE_ANON_KEY"; fi
if printf '%s\n' "$mcpenv" | grep -q 'NEXT_PUBLIC_SUPABASE'; then bad "mcp kind must not seed NEXT_PUBLIC_SUPABASE_* names"; else ok "mcp kind has no NEXT_PUBLIC names"; fi

nextenv=$(renderenv sb 3101 sb.bcn-services.com certbot next)
if printf '%s\n' "$nextenv" | grep -qx '# NEXT_PUBLIC_SUPABASE_URL='; then ok "next kind seeds NEXT_PUBLIC_SUPABASE_URL"; else bad "next kind missing NEXT_PUBLIC_SUPABASE_URL"; fi
if printf '%s\n' "$nextenv" | grep -qx '# NEXT_PUBLIC_SUPABASE_ANON_KEY='; then ok "next kind seeds NEXT_PUBLIC_SUPABASE_ANON_KEY"; else bad "next kind missing NEXT_PUBLIC_SUPABASE_ANON_KEY"; fi
if printf '%s\n' "$nextenv" | grep -qx '# SUPABASE_URL='; then bad "next kind must not seed the bare (mcp) SUPABASE_URL name"; else ok "next kind has no bare SUPABASE_URL"; fi

defenv=$(renderenv sb 3101 sb.bcn-services.com certbot)
if printf '%s\n' "$defenv" | grep -qx '# NEXT_PUBLIC_SUPABASE_URL='; then ok "kind defaults to next when the 5th arg is omitted"; else bad "kind default is not next"; fi

emptyenv=$(renderenv sb 3101 sb.bcn-services.com certbot "")
if printf '%s\n' "$emptyenv" | grep -qx '# NEXT_PUBLIC_SUPABASE_URL='; then ok "kind defaults to next when the 5th arg is an explicit empty string"; else bad "kind default is not next for an explicit empty string"; fi

echo "onboard-client.sh cert modes"

render() { BCNS_PORTS_FILE="$reg" BCNS_RENDER_ONLY=1 bash "$here/onboard-client.sh" "$@" 2>/dev/null; }
# cloudflare mode must emit exactly the pre-platform-v1 template (fixture rendered
# from the heredoc that shipped before the cert-mode argument existed).
check "cloudflare render == pre-platform-v1 template (l2detailz fixture)" \
  "$(render l2detailz 3100 l2details.com cloudflare | diff -q - "$here/__tests__/fixtures/l2detailz.vhost" >/dev/null && echo same || echo differs)" "same"
check "non-bcn-services domain defaults to cloudflare" \
  "$(render l2detailz 3100 l2details.com | diff -q - "$here/__tests__/fixtures/l2detailz.vhost" >/dev/null && echo same || echo differs)" "same"
sbv=$(render sb 3101 sb.bcn-services.com)
case "$sbv" in *'/etc/letsencrypt/live/sb.bcn-services.com/fullchain.pem'*) ok "bcn-services subdomain defaults to certbot live paths" ;; *) bad "certbot live cert path missing" ;; esac
case "$sbv" in *'location /.well-known/acme-challenge/'*) ok "certbot vhost serves the ACME webroot on :80" ;; *) bad "ACME location missing" ;; esac
case "$sbv" in *'listen 80;'*) ok "certbot vhost listens on 80" ;; *) bad "no :80 listener" ;; esac
case "$sbv" in *'return 301 https://sb.bcn-services.com$request_uri;'*) ok "certbot vhost 301s http -> https" ;; *) bad "http->https redirect missing" ;; esac
case "$sbv" in *'server_name www.'*) bad "certbot vhost must not add a www block for a subdomain" ;; *) ok "certbot vhost has no www block" ;; esac
case "$sbv" in *'/etc/ssl/cloudflare/'*) bad "certbot vhost must not reference the Cloudflare origin cert" ;; *) ok "certbot vhost never touches the Cloudflare cert" ;; esac
case "$sbv" in *'proxy_pass http://127.0.0.1:3101;'*) ok "certbot vhost proxies to the registered port" ;; *) bad "proxy_pass port wrong" ;; esac
case "$sbv" in *'proxy_buffer_size        16k;'*) ok "certbot vhost keeps the Supabase cookie buffers" ;; *) bad "proxy buffers missing" ;; esac
cdv=$(render sb 3101 sb.bcn-services.com /etc/ssl/custom)
case "$cdv" in *'ssl_certificate     /etc/ssl/custom/fullchain.pem;'*) ok "cert-dir mode uses <dir>/fullchain.pem" ;; *) bad "cert-dir path wrong" ;; esac
case "$(cat "$here/onboard-client.sh")" in *'certbot certonly --webroot'*) ok "certbot runs webroot HTTP-01 (no nginx plugin rewriting vhosts)" ;; *) bad "certbot invocation not webroot" ;; esac

echo "syntax"
for f in "$here"/*.sh; do
  bash -n "$f" 2>/dev/null && ok "$(basename "$f") parses" || bad "$(basename "$f") syntax error"
done

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
