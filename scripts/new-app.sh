#!/usr/bin/env bash
# Stamp a new client app from apps/_template:
#   ./scripts/new-app.sh <slug> <port> [--dry-run]
# Run from the repo root (the `/new-client-app` skill does this). Validates
# the slug and port, refuses a collision against infra/ports.txt or an
# existing apps/<slug>, copies apps/_template -> apps/<slug>, stamps the
# package name and display name (TEMPLATE.md's "Required at creation" table),
# writes CLIENT.md, and appends the port registry entry.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

dry_run=0
args=()
for a in "$@"; do
  if [ "$a" = "--dry-run" ]; then dry_run=1; else args+=("$a"); fi
done
[ "${#args[@]}" -eq 2 ] || { echo "usage: $0 <slug> <port> [--dry-run]" >&2; exit 1; }
slug="${args[0]}"; port="${args[1]}"

[[ "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "slug must be [a-z0-9-] and not start with -" >&2; exit 1; }
case "$slug" in
  _template|web|sb|connect|mcp)
    echo "slug '$slug' is reserved" >&2; exit 1 ;;
esac
[[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] \
  || { echo "port must be 1024-65535" >&2; exit 1; }

[ -e "apps/$slug" ] && { echo "apps/$slug already exists" >&2; exit 1; }

# Comment-safe, CRLF-safe lookups against the port registry (infra/onboard-client.sh).
ports_file="$root/infra/ports.txt"
existing_slug=$(awk -v s="$slug" '/^[[:space:]]*#/{next} $1==s {print $1}' "$ports_file" | tr -d '\r' | head -n1)
existing_port=$(awk -v p="$port" '/^[[:space:]]*#/{next} $2==p {print $1}' "$ports_file" | tr -d '\r' | head -n1)
[ -z "$existing_slug" ] || { echo "slug '$slug' is already registered in infra/ports.txt" >&2; exit 1; }
[ -z "$existing_port" ] || { echo "port $port is already registered to '$existing_port' in infra/ports.txt" >&2; exit 1; }

# slug -> Title Case ("coventry-hills" -> "Coventry Hills")
display_name=$(printf '%s' "$slug" | awk -F'-' '{ out=""; for (i=1;i<=NF;i++) { w=$i; out = out (i>1?" ":"") toupper(substr(w,1,1)) substr(w,2) } print out }')

if [ "$dry_run" -eq 1 ]; then
  echo "[dry-run] would create apps/$slug from apps/_template"
  echo "[dry-run] would set package.json name -> @bcn-services/$slug"
  echo "[dry-run] would set app/layout.tsx metadata.title -> \"$display_name\""
  echo "[dry-run] would set app/page.tsx <h1> -> \"$display_name\""
  echo "[dry-run] would write apps/$slug/CLIENT.md"
  echo "[dry-run] would append \"$slug $port\" to infra/ports.txt (kept sorted by port)"
  exit 0
fi

dest="apps/$slug"
mkdir -p "$dest"
# rsync-free copy: cp -R then prune build/dep dirs that shouldn't ship per app.
cp -R "apps/_template/." "$dest/"
rm -rf "$dest/node_modules" "$dest/.next" "$dest/.turbo"

# package.json name
node -e '
  const fs = require("fs");
  const p = process.argv[1], slug = process.argv[2];
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  pkg.name = "@bcn-services/" + slug;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
' "$dest/package.json" "$slug"

# app/layout.tsx metadata.title, app/page.tsx <h1>
node -e '
  const fs = require("fs");
  const [, layoutPath, pagePath, name] = process.argv;
  let layout = fs.readFileSync(layoutPath, "utf8");
  layout = layout.replace(/title:\s*"[^"]*"/, `title: "${name}"`);
  fs.writeFileSync(layoutPath, layout);
  let page = fs.readFileSync(pagePath, "utf8");
  page = page.replace(/<h1>[^<]*<\/h1>/, `<h1>${name}</h1>`);
  fs.writeFileSync(pagePath, page);
' "$dest/app/layout.tsx" "$dest/app/page.tsx" "$display_name"

cat > "$dest/CLIENT.md" <<EOF
# CLIENT.md — $display_name

Stamped by \`scripts/new-app.sh $slug $port\`. Fill in as decisions are made
— see \`TEMPLATE.md\` for the config-decision table this app inherited from
the template.

- **Display name:** $display_name
- **Slug:** $slug
- **Port:** $port

## Open questions

- Storage backend: Undecided (template default: off — \`lib/storage.ts\`)
- AI feature: Undecided (template default: off — \`AI_ENABLED\`)
- Webhook providers: Undecided (template default: none)
EOF

# Append to infra/ports.txt, keep it sorted by port (header stays on top).
tmp=$(mktemp)
{
  awk '/^[[:space:]]*#/ || /^[[:space:]]*$/' "$ports_file"
  { grep -v '^[[:space:]]*#' "$ports_file" | grep -v '^[[:space:]]*$'; printf '%s %s\n' "$slug" "$port"; } \
    | sort -k2,2n
} > "$tmp"
mv "$tmp" "$ports_file"

echo "created apps/$slug (@bcn-services/$slug), port $port"
echo "next steps:"
echo "  1. corepack pnpm install"
echo "  2. fill in apps/$slug/CLIENT.md open questions"
echo "  3. corepack pnpm --filter @bcn-services/$slug dev"
echo "  4. infra/onboard-client.sh $slug $port <domain> — provisions the droplet"
