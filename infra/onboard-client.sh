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
#
# The www block is not optional. 00-default is a `return 444` catch-all, so any
# hostname without an explicit server_name gets its connection dropped -- and a
# client's existing site almost always answers on both apex and www. Without
# this, the DNS cutover silently breaks every www visitor while the apex looks
# fine. Redirect rather than a second server_name so one host stays canonical.
cat > "/etc/nginx/sites-available/$slug" <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.$domain;
    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;
    return 301 https://$domain\$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $domain;
    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;
    # Proxy defaults sit at server level so BOTH location blocks inherit them.
    # Duplicating them per-location is how the two copies drift apart.
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    # CVE-2025-29927. Next uses x-middleware-subrequest to stop middleware from
    # recursing, and (<14.2.25) trusts the value the CLIENT sends. A forged one
    # skips middleware.ts outright -- including the /admin auth gate. Overwrite
    # it unconditionally so a client-supplied value can never reach the app.
    proxy_set_header x-middleware-subrequest "";
    # nginx defaults (4k/8k) are too small for a Supabase auth response.
    # @supabase/ssr rotates the session on every request and chunks the JWT
    # across sb-<ref>-auth-token.0/.1/..., so the combined Set-Cookie headers
    # overflow the buffer and nginx answers 502 "upstream sent too big
    # header". Anonymous traffic is unaffected, which is what makes this
    # nasty: the site looks fine, and only SIGNED-IN users -- the operator --
    # get 502s.
    proxy_buffer_size        16k;
    proxy_buffers         8  16k;
    proxy_busy_buffers_size  32k;

    # A bcns marketing home page is server components only -- no form, no server
    # action, no client fetch -- so POST / is never legitimate traffic. It is
    # the React2Shell (CVE-2025-66478) RCE probe, which POSTs a crafted RSC
    # payload to the PAGE url. Dropping it at the edge keeps the payload out of
    # Node, and stops the unhandled rejection it raises inside Next's own error
    # handler from filling Sentry. 444 closes the connection with no response,
    # so the scanner gets nothing back to fingerprint.
    #
    # IF YOU EVER ADD A SERVER ACTION TO `/`, DELETE THIS BLOCK. Server actions
    # POST to the page url, so this would 444 the action and the form would fail
    # with no error anywhere. Actions on any OTHER route are unaffected.
    location = / {
        if (\$request_method = POST) {
            return 444;
        }
        proxy_pass http://127.0.0.1:$port;
    }
    location / {
        proxy_pass http://127.0.0.1:$port;
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
