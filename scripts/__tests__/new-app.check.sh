#!/usr/bin/env bash
# Guards scripts/new-app.sh. Run: bash scripts/__tests__/new-app.check.sh
# Runs against a temp copy of the repo tree so a real run's mutations
# (apps/<slug>, infra/ports.txt) never touch the working tree.
set -uo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)   # scripts/
root=$(cd "$here/.." && pwd)             # repo root
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0; fail=0

ok()   { printf '  ok   %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

# Minimal tree: the script only touches apps/_template, apps/<slug>, and
# infra/ports.txt, and resolves root from $0's own location.
tree="$work/repo"
mkdir -p "$tree/scripts" "$tree/apps/_template/app" "$tree/infra"
cp "$here/new-app.sh" "$tree/scripts/new-app.sh"
# Fixture registry, not the real infra/ports.txt: the collision cases below name
# specific slugs/ports, so they must not drift when a real client is added.
printf '# slug port\nl2detailz 3100\nsb 3101\nconnect 3102\nmcp 3103\n' > "$tree/infra/ports.txt"
cat > "$tree/apps/_template/package.json" <<'EOF'
{ "name": "@bcn-services/_template", "version": "0.0.0" }
EOF
mkdir -p "$tree/apps/_template/app"
cat > "$tree/apps/_template/app/layout.tsx" <<'EOF'
export const metadata = { title: "bcns App Template" };
EOF
cat > "$tree/apps/_template/app/page.tsx" <<'EOF'
export default function Page() { return <h1>bcns App Template</h1>; }
EOF

run() { bash "$tree/scripts/new-app.sh" "$@"; }

echo "argument validation"
check "rejects uppercase slug"      "$(run BAD 3000 >/dev/null 2>&1; echo $?)"        "1"
check "rejects slug starting with -" "$(run -bad 3000 >/dev/null 2>&1; echo $?)"      "1"
check "rejects non-numeric port"    "$(run good abcd >/dev/null 2>&1; echo $?)"       "1"
check "rejects privileged port"     "$(run good 80 >/dev/null 2>&1; echo $?)"         "1"
check "rejects port > 65535"        "$(run good 70000 >/dev/null 2>&1; echo $?)"      "1"
check "rejects wrong arg count"     "$(run only-one >/dev/null 2>&1; echo $?)"        "1"

echo "reserved slugs"
for r in _template web sb connect mcp; do
  check "rejects reserved slug '$r'" "$(run "$r" 3199 >/dev/null 2>&1; echo $?)" "1"
done

echo "registry collisions"
# Each case must be decided by exactly ONE guard, or a rotted guard hides behind
# another. 'sb' was useless here: the reserved-slug list rejects it first.
# 'l2detailz' is registered in the fixture but is neither reserved nor a dir.
check "rejects slug already in infra/ports.txt (slug guard)" \
  "$(run l2detailz 3199 >/dev/null 2>&1; echo $?)" "1"
check "rejects port already registered to another slug (port guard)" \
  "$(run brandnew 3101 >/dev/null 2>&1; echo $?)" "1"
check "rejects a fresh slug taking l2detailz's port (port guard)" \
  "$(run brandnew-two 3100 >/dev/null 2>&1; echo $?)" "1"
check "rejects apps/<slug> already existing" \
  "$(mkdir -p "$tree/apps/taken"; run taken 3199 >/dev/null 2>&1; echo $?; rmdir "$tree/apps/taken")" "1"

echo "dry-run makes no changes"
before_ports=$(cat "$tree/infra/ports.txt")
run coventry-hills 3110 --dry-run >/dev/null 2>&1
check "dry-run exits zero" "$?" "0"
check "dry-run does not create the app dir" "$([ -d "$tree/apps/coventry-hills" ] && echo yes || echo no)" "no"
check "dry-run does not touch ports.txt" "$(cat "$tree/infra/ports.txt")" "$before_ports"

echo "happy path"
out=$(run coventry-hills 3110 2>&1)
check "happy path exits zero" "$?" "0"
check "app dir created" "$([ -d "$tree/apps/coventry-hills" ] && echo yes || echo no)" "yes"
check "prints the app_url step for this slug" \
  "$(grep -c "app_url = 'https://<domain>' where slug = 'coventry-hills';" <<<"$out")" "1"
check "package name stamped" \
  "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).name)' "$tree/apps/coventry-hills/package.json")" \
  "@bcn-services/coventry-hills"
check "layout title stamped" \
  "$(grep -c 'title: "Coventry Hills"' "$tree/apps/coventry-hills/app/layout.tsx")" "1"
check "page h1 stamped" \
  "$(grep -c '<h1>Coventry Hills</h1>' "$tree/apps/coventry-hills/app/page.tsx")" "1"
check "CLIENT.md written" "$([ -f "$tree/apps/coventry-hills/CLIENT.md" ] && echo yes || echo no)" "yes"
check "ports.txt line appended" \
  "$(awk '$1=="coventry-hills"{print $2}' "$tree/infra/ports.txt")" "3110"
check "ports.txt stays sorted by port" \
  "$(grep -v '^[[:space:]]*#' "$tree/infra/ports.txt" | grep -v '^[[:space:]]*$' | awk '{print $2}' | sort -n | tr '\n' ' ')" \
  "$(grep -v '^[[:space:]]*#' "$tree/infra/ports.txt" | grep -v '^[[:space:]]*$' | awk '{print $2}' | tr '\n' ' ')"
regs=$(grep -v '^[[:space:]]*#' "$tree/infra/ports.txt" | grep -c .)
check "ports.txt slugs still unique" \
  "$(grep -v '^[[:space:]]*#' "$tree/infra/ports.txt" | awk '{print $1}' | sort -u | wc -l | tr -d ' ')" "$regs"
check "ports.txt ports still unique" \
  "$(grep -v '^[[:space:]]*#' "$tree/infra/ports.txt" | awk '{print $2}' | sort -u | wc -l | tr -d ' ')" "$regs"
# The rewrite goes through mktemp (mode 600); the registry must stay readable.
check "ports.txt stays world-readable" \
  "$(stat -f '%OLp' "$tree/infra/ports.txt" 2>/dev/null || stat -c '%a' "$tree/infra/ports.txt")" "644"

echo "idempotence"
# This one is caught by the apps/<slug> exists guard, not the registry — which
# is the point of idempotence. The registry guards are covered above.
check "second run with the same slug refuses (dir-exists guard)" "$(run coventry-hills 3110 >/dev/null 2>&1; echo $?)" "1"
check "second run with the same port (new slug) refuses" "$(run coventry-hills-two 3110 >/dev/null 2>&1; echo $?)" "1"

echo "syntax"
bash -n "$here/new-app.sh" && ok "new-app.sh parses" || bad "new-app.sh syntax error"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
