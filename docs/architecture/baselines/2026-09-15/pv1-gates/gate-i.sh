#!/bin/zsh
# gate (i): hub standalone against LOCAL Supabase; sign in as SB smoke user; assert pages.
set -u
export T=/Users/nateseluga/.claude/jobs/d6dffe8b/tmp
W=/Users/nateseluga/bcns/.claude/worktrees/pv1-4-hub
cd ~/bcns-data && eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|DB_URL)=')"; cd "$W"
SHA=$(git rev-parse --short HEAD)
OUT=$T/gate-i/transcript.txt
# restart local hub from the standalone build
[ -f $T/gate-i/server.pid ] && kill $(cat $T/gate-i/server.pid) 2>/dev/null; sleep 1
( cd apps/connect/.next/standalone && PORT=3102 HOSTNAME=127.0.0.1 NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY node server.js > $T/gate-i/server.log 2>&1 & echo $! > $T/gate-i/server.pid )
for i in {1..20}; do curl -sf http://127.0.0.1:3102/api/health >/dev/null && break; sleep 0.5; done
PW=$(security find-generic-password -s bcns-smoke-sb -a smoke+sb@bcn-services.com -w)
mint() { # $1 = label; prints cookie header value to $T/gate-i/$1
  local sess=$(curl -sS "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "{\"email\":\"smoke+sb@bcn-services.com\",\"password\":\"$PW\"}")
  local claims=$(echo "$sess" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8"));const p=JSON.parse(Buffer.from(s.access_token.split(".")[1],"base64url"));console.log("client_role="+p.client_role,"client_id="+p.client_id)')
  echo "$sess" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write("sb-127-auth-token=base64-"+Buffer.from(JSON.stringify(s)).toString("base64url"))' > $T/gate-i/$1
  echo "fresh password-grant claims: $claims"
}
text() { grep -oE '<(h1|h2|h3|p|span|td|button)[^>]*>[^<]{3,80}<' "$1" | sed -E 's/<[^>]*>//g; s/<$//' | head -30 | tr '\n' '|'; }
assert() { # $1 desc $2 file $3 regex
  if grep -qiE "$3" "$2"; then echo "PASS  $1  → $(grep -oiE "$3" "$2" | head -1)"; else echo "FAIL  $1"; fi
}
{
echo "## gate (i) — hub standalone next start on 127.0.0.1:3102 against LOCAL Supabase $API_URL — $(date -u +%FT%TZ) — commit $SHA"
echo "session: GoTrue password grant as smoke+sb@bcn-services.com (keychain bcns-smoke-sb), injected as @supabase/ssr cookie sb-127-auth-token=base64-<b64url(session)>"
mint cookie.txt
C="Cookie: $(cat $T/gate-i/cookie.txt)"
for p in / /team /access /login /api/health; do
  n=${p//\//_}; echo; echo "\$ curl -sSI -H 'Cookie: <session>' http://127.0.0.1:3102$p"
  curl -sS -D - -o $T/gate-i/page$n.html -H "$C" http://127.0.0.1:3102$p | grep -iE '^(HTTP|location|content-type)'
done
echo; echo '$ signed OUT: curl -sSI http://127.0.0.1:3102/  (Next normalises loopback Host to localhost; prod: gate-g/connect.txt)'
curl -sSI http://127.0.0.1:3102/ | grep -iE '^(HTTP|location)'
echo; echo '$ /api/health body'; cat $T/gate-i/page_api_health.html; echo
echo; echo "## assertions (member view)"
assert "/ renders client name Saunaboy" $T/gate-i/page_.html 'Saunaboy'
assert "/ sources: Shopify" $T/gate-i/page_.html 'Shopify'
assert "/ sources: Meta" $T/gate-i/page_.html 'Meta'
assert "/ sources: monday" $T/gate-i/page_.html 'monday'
assert "/ Request connection buttons" $T/gate-i/page_.html 'Request connection'
assert "/ health badge" $T/gate-i/page_.html 'Not connected'
assert "/ last pull" $T/gate-i/page_.html 'Last success: (<!-- -->)?never|Last success: \\",\\"never'
assert "/ Open your dashboard" $T/gate-i/page_.html 'Open your dashboard'
assert "/ SB link href" $T/gate-i/page_.html 'https://sb\.bcn-services\.com'
assert "/team renders (member: smoke rows hidden by design)" $T/gate-i/page_team.html 'No members yet|Members'
assert "/login renders form" $T/gate-i/page_login.html 'Sign in'
echo "counts: Request connection ×$(grep -o 'Request connection' $T/gate-i/page_.html | wc -l | tr -d ' ')"
if grep -qi 'service_role' $T/gate-i/page*.html; then echo "FAIL  service-role string found"; else echo "PASS  no service-role string in any page HTML"; fi
echo; echo "## owner addendum: /team hides is_smoke rows from members and /access is owner-only, so the LOCAL fixture is promoted for this capture"
echo '$ psql update data.memberships set role=owner where user_id=792a1d8c-… and client_id=ae196fbf-…'
psql "$DB_URL" -Atc "update data.memberships set role='owner' where user_id='792a1d8c-f66b-48eb-adac-bf5611799730' and client_id='ae196fbf-c726-4648-8b6e-6d1933aa9744'"
mint cookie-owner.txt
C="Cookie: $(cat $T/gate-i/cookie-owner.txt)"
for p in /team /access; do n=${p//\//_}; echo; echo "\$ curl -sSI -H 'Cookie: <owner session>' http://127.0.0.1:3102$p"; curl -sS -D - -o $T/gate-i/page-owner$n.html -H "$C" http://127.0.0.1:3102$p | grep -iE '^(HTTP|location)'; done
echo; echo "/team text: $(text $T/gate-i/page-owner_team.html)"; echo; echo "/access text: $(text $T/gate-i/page-owner_access.html)"; echo
assert "/team lists the smoke membership row (792a1d8c)" $T/gate-i/page-owner_team.html '792a1d8c'
assert "/team shows role owner" $T/gate-i/page-owner_team.html 'owner'
assert "/team owner sees invite form" $T/gate-i/page-owner_team.html 'Send invite'
assert "/access renders for owner (mint UI)" $T/gate-i/page-owner_access.html 'Mint agent login'
assert "/access review copy applied" $T/gate-i/page-owner_access.html 'the old password stops working'
echo; echo '$ psql revert fixture to member'
psql "$DB_URL" -Atc "update data.memberships set role='member' where user_id='792a1d8c-f66b-48eb-adac-bf5611799730'"
echo; echo "## server log tail"; tail -3 $T/gate-i/server.log
} 2>&1 | tee $OUT
