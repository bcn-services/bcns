#!/usr/bin/env bash
# Add one client to the droplet:
#   ./onboard-client.sh <slug> <port> <domain> [cloudflare|certbot|<cert-dir>]
# Creates the Unix user (kernel-enforced secret separation), dirs, env file,
# a sudoers rule scoped to restarting only their own unit, the nginx vhost,
# and enables the unit.
#
# Cert mode (4th arg) decides how the vhost terminates TLS:
#   cloudflare  Cloudflare Origin CA cert at /etc/ssl/cloudflare/origin.{pem,key}.
#               Only valid for hosts proxied through Cloudflare (l2details.com).
#               Template is unchanged from before platform-v1 — see infra.check.sh,
#               which renders it for l2detailz and compares the md5 to the live file.
#   certbot     Publicly-trusted Let's Encrypt cert via HTTP-01 (webroot). Used for
#               hosts whose DNS points straight at the droplet (*.bcn-services.com).
#               Staged: port-80 vhost -> reload -> certonly -> 443 vhost -> reload,
#               because a vhost citing a cert that does not exist yet fails nginx -t.
#   <cert-dir>  Absolute dir holding fullchain.pem + privkey.pem you manage yourself.
# Default: certbot when the domain ends in .bcn-services.com, else cloudflare.
set -euo pipefail

# Args are validated before the root check so an obvious typo fails fast (and so
# infra/__tests__ can exercise the validation without root). All values are
# interpolated into the nginx vhost or the env file, so all are checked --
# an unvalidated ';' in port or domain injects nginx directives.
[ $# -eq 3 ] || [ $# -eq 4 ] \
  || { echo "usage: $0 <slug> <port> <domain> [cloudflare|certbot|<cert-dir>]" >&2; exit 1; }
slug="$1"; port="$2"; domain="$3"; cert_mode="${4:-}"
[[ "$slug" =~ ^[a-z0-9-]+$ ]] || { echo "slug must be [a-z0-9-]" >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] \
  || { echo "port must be 1024-65535" >&2; exit 1; }
[[ "$domain" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo "domain must be [a-zA-Z0-9.-]" >&2; exit 1; }

if [ -z "$cert_mode" ]; then
  case "$domain" in
    *.bcn-services.com) cert_mode=certbot ;;
    *)                  cert_mode=cloudflare ;;
  esac
fi
case "$cert_mode" in
  cloudflare)
    cert_file=/etc/ssl/cloudflare/origin.pem
    key_file=/etc/ssl/cloudflare/origin.key ;;
  certbot)
    cert_file="/etc/letsencrypt/live/$domain/fullchain.pem"
    key_file="/etc/letsencrypt/live/$domain/privkey.pem" ;;
  /*)
    [[ "$cert_mode" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "cert-dir must be [A-Za-z0-9._/-]" >&2; exit 1; }
    cert_file="${cert_mode%/}/fullchain.pem"
    key_file="${cert_mode%/}/privkey.pem" ;;
  *) echo "cert mode must be cloudflare, certbot, or an absolute cert dir" >&2; exit 1 ;;
esac

# Port registry: infra/ports.txt (shipped next to this script) is the single
# source of truth for slug -> port. Two apps on one port fail at first start in a
# way systemd reports as "active" for a few seconds, so refuse here instead.
# BCNS_PORTS_FILE overrides the location (tests).
ports_file="${BCNS_PORTS_FILE:-$(cd "$(dirname "$0")" && pwd)/ports.txt}"
[ -r "$ports_file" ] || { echo "ports registry not found: $ports_file (scp infra/ports.txt next to this script)" >&2; exit 1; }
registered_port=$(awk -v s="$slug" '$1==s {print $2}' "$ports_file")
port_owner=$(awk -v p="$port" '$2==p {print $1}' "$ports_file")
if [ -z "$registered_port" ]; then
  echo "slug '$slug' is not in $ports_file -- add '$slug $port' to infra/ports.txt (scripts/new-app.sh does this) and re-run" >&2; exit 1
fi
if [ "$registered_port" != "$port" ]; then
  echo "slug '$slug' is registered on port $registered_port, not $port" >&2; exit 1
fi
if [ "$port_owner" != "$slug" ]; then
  echo "port $port is registered to '$port_owner'" >&2; exit 1
fi

# Contact for Let's Encrypt expiry mail. Same address as apps/web/lib/site.ts `email`.
certbot_email="${BCNS_CERTBOT_EMAIL:-nseluga@bcn-services.com}"
acme_root=/var/www/acme

# nginx vhost templates. Cloudflare -> origin TLS -> this client's app port.
#
# The www block is not optional. 00-default is a `return 444` catch-all, so any
# hostname without an explicit server_name gets its connection dropped -- and a
# client's existing site almost always answers on both apex and www. Without
# this, the DNS cutover silently breaks every www visitor while the apex looks
# fine. Redirect rather than a second server_name so one host stays canonical.
render_proxied_vhost() {
cat <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.$domain;
    ssl_certificate     $cert_file;
    ssl_certificate_key $key_file;
    return 301 https://$domain\$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $domain;
    ssl_certificate     $cert_file;
    ssl_certificate_key $key_file;
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
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
    }
}
EOF
}

# Direct-to-droplet hosts (no Cloudflare): port 80 answers the ACME challenge
# and 301s everything else to https. No www block -- these are subdomains.
render_acme_http_vhost() {
cat <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    location /.well-known/acme-challenge/ {
        root $acme_root;
    }
    location / {
        return 301 https://$domain\$request_uri;
    }
}
EOF
}

render_direct_vhost() {
render_acme_http_vhost
cat <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $domain;
    ssl_certificate     $cert_file;
    ssl_certificate_key $key_file;
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        # See the proxied template above: Supabase session cookies overflow the
        # default header buffers and only signed-in users see the 502.
        proxy_buffer_size        16k;
        proxy_buffers         8  16k;
        proxy_busy_buffers_size  32k;
    }
}
EOF
}

# Test hook: print the final vhost and stop before anything needs root.
if [ "${BCNS_RENDER_ONLY:-}" = "1" ]; then
  case "$cert_mode" in
    certbot) render_direct_vhost ;;
    *)       render_proxied_vhost ;;
  esac
  exit 0
fi

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

vhost="/etc/nginx/sites-available/$slug"
# `nginx -t && reload` does NOT abort under `set -e` (a failure on the left of
# && is exempt), so a bad config used to fall through to the success message.
enable_vhost() {
  ln -sf "$vhost" "/etc/nginx/sites-enabled/$slug"
  if ! nginx -t; then
    echo "nginx config test failed -- removing $slug vhost and aborting" >&2
    rm -f "/etc/nginx/sites-enabled/$slug"
    exit 1
  fi
  systemctl reload nginx
}

if [ "$cert_mode" = certbot ]; then
  if [ ! -s "$cert_file" ]; then
    # Stage 1: http-only vhost so the ACME challenge is reachable, then issue.
    install -d -m 755 "$acme_root"
    render_acme_http_vhost > "$vhost"
    enable_vhost
    if ! certbot certonly --webroot -w "$acme_root" -d "$domain" \
         -m "$certbot_email" --agree-tos --no-eff-email --non-interactive; then
      echo "certbot failed for $domain -- removing $slug vhost and aborting" >&2
      rm -f "/etc/nginx/sites-enabled/$slug" "$vhost"
      systemctl reload nginx
      exit 1
    fi
  fi
  # Stage 2: full vhost. Renewals reuse the webroot via the same port-80 block.
  render_direct_vhost > "$vhost"
else
  render_proxied_vhost > "$vhost"
fi
enable_vhost

systemctl enable "bcns-app@$slug"

cat <<EOF
Onboarded $slug on port $port ($domain, tls: $cert_mode). Next:
  1. Fill /srv/$slug/env (Supabase keys etc.).
  2. Add the CI deploy public key to /srv/$slug/.ssh/authorized_keys (owner $slug, mode 600).
  3. Append '$slug=<direct/session DATABASE_URL>' to /etc/bcns/backup-dbs for
     nightly pg_dump — the DIRECT connection string, not the pgbouncer
     transaction pooler (pg_dump breaks through it). Supabase direct is
     IPv6-first: use the session pooler URL if the droplet lacks IPv6.
  4. First deploy via the repo's deploy workflow, then: systemctl start bcns-app@$slug
EOF
