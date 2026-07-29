#!/usr/bin/env bash
# Add one client to the droplet: ./onboard-client.sh <slug> <port> <domain>
# Creates the Unix user (kernel-enforced secret separation), dirs, env file,
# a sudoers rule scoped to restarting only their own unit, the nginx vhost,
# and enables the unit.
set -euo pipefail

# Args are validated before the root check so an obvious typo fails fast (and so
# infra/__tests__ can exercise the validation without root). All three values are
# interpolated into the nginx vhost or the env file, so all three are checked --
# an unvalidated ';' in port or domain injects nginx directives.
[ $# -eq 3 ] || { echo "usage: $0 <slug> <port> <domain>" >&2; exit 1; }
slug="$1"; port="$2"; domain="$3"
[[ "$slug" =~ ^[a-z0-9-]+$ ]] || { echo "slug must be [a-z0-9-]" >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] \
  || { echo "port must be 1024-65535" >&2; exit 1; }
[[ "$domain" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo "domain must be [a-zA-Z0-9.-]" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

useradd --system --create-home --home-dir "/srv/$slug" --shell /bin/bash "$slug"
chmod 750 "/srv/$slug"
install -d -o "$slug" -g "$slug" "/srv/$slug/releases" "/srv/$slug/.ssh"

# Env file: this client's secrets only, unreadable to every other client.
cat > "/srv/$slug/env" <<EOF
PORT=$port
HOSTNAME=127.0.0.1
# DATABASE_URL=
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
EOF
chown "$slug:$slug" "/srv/$slug/env"
chmod 600 "/srv/$slug/env"

# CI may restart this client's unit and nothing else. Validate before install —
# a bad sudoers line breaks sudo droplet-wide.
tmp=$(mktemp)
echo "$slug ALL=(root) NOPASSWD: /usr/bin/systemctl restart bcns-app@$slug" > "$tmp"
visudo -cf "$tmp"
install -m 440 "$tmp" "/etc/sudoers.d/bcns-$slug"
rm -f "$tmp"

# nginx vhost: Cloudflare -> origin TLS -> this client's app port.
cat > "/etc/nginx/sites-available/$slug" <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $domain;
    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
ln -sf "/etc/nginx/sites-available/$slug" "/etc/nginx/sites-enabled/$slug"
# `nginx -t && reload` does NOT abort under `set -e` (a failure on the left of
# && is exempt), so a bad config used to fall through to the success message.
if ! nginx -t; then
  echo "nginx config test failed -- removing $slug vhost and aborting" >&2
  rm -f "/etc/nginx/sites-enabled/$slug"
  exit 1
fi
systemctl reload nginx

systemctl enable "bcns-app@$slug"

cat <<EOF
Onboarded $slug on port $port ($domain). Next:
  1. Fill /srv/$slug/env (Supabase keys etc.).
  2. Add the CI deploy public key to /srv/$slug/.ssh/authorized_keys (owner $slug, mode 600).
  3. Append '$slug=<direct/session DATABASE_URL>' to /etc/bcns/backup-dbs for
     nightly pg_dump — the DIRECT connection string, not the pgbouncer
     transaction pooler (pg_dump breaks through it). Supabase direct is
     IPv6-first: use the session pooler URL if the droplet lacks IPv6.
  4. First deploy via the repo's deploy workflow, then: systemctl start bcns-app@$slug
EOF
