#!/usr/bin/env bash
# Fresh DO droplet -> ready to host client apps. Run once as root.
# Rebuild-from-scratch is this script + onboard-client.sh per client +
# each client repo's deploy workflow re-run. Rehearse before client one.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ufw fail2ban unattended-upgrades rsync curl gnupg \
  nginx s3cmd

# postgresql-client matching Supabase's Postgres major (17) — Ubuntu's default
# client is older and pg_dump refuses newer servers. PGDG repo:
install -d /usr/share/postgresql-common/pgdg
curl -fsS -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y postgresql-client-17

# Node 22 (must match CI's node-version) + pnpm via corepack
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
corepack enable

# Unattended security upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

# SSH: keys only. Drop-in named to sort first — sshd takes the FIRST value it
# sees, and cloud-init's 50-*.conf may say yes.
echo "PasswordAuthentication no" > /etc/ssh/sshd_config.d/00-bcns.conf
systemctl reload ssh

# Firewall: SSH open; web only from Cloudflare (the WAF is decoration otherwise)
ipv4=$(curl -fsS https://www.cloudflare.com/ips-v4) || { echo "CF ipv4 fetch failed" >&2; exit 1; }
ipv6=$(curl -fsS https://www.cloudflare.com/ips-v6) || { echo "CF ipv6 fetch failed" >&2; exit 1; }
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
for ip in $ipv4 $ipv6; do
  ufw allow from "$ip" to any port 80,443 proto tcp
done
ufw --force enable

# nginx: TLS termination with a Cloudflare Origin CA cert; per-client vhosts
# are dropped in by onboard-client.sh. Default server rejects unknown hosts.
install -d -m 700 /etc/ssl/cloudflare
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/00-default <<'EOF'
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;
    return 444;
}
EOF
ln -sf /etc/nginx/sites-available/00-default /etc/nginx/sites-enabled/00-default

# App unit template + nightly backups
install -m 644 "$(dirname "$0")/bcns-app@.service" /etc/systemd/system/
systemctl daemon-reload
install -m 700 "$(dirname "$0")/backup.sh" /usr/local/bin/bcns-backup
mkdir -p /etc/bcns && chmod 700 /etc/bcns
touch /etc/bcns/backup-dbs && chmod 600 /etc/bcns/backup-dbs
echo '17 3 * * * root /usr/local/bin/bcns-backup' > /etc/cron.d/bcns-backup

cat <<'EOF'
Done. Manual follow-ups (one-time):
  1. DO console: resource alerts (memory/CPU/disk ~80%), droplet backups, and
     the free DO *cloud* firewall mirroring the UFW rules (defense in depth).
  2. Cloudflare Origin CA cert (wildcard for the platform domain) ->
     /etc/ssl/cloudflare/origin.pem + origin.key (mode 600), then: nginx -t && systemctl reload nginx
     (client-owned custom domains need their own origin cert + vhost tweak)
  3. ~/.s3cfg for Spaces (access key, secret, host_base = <region>.digitaloceanspaces.com).
  4. Spaces bucket: 30-day lifecycle expiration rule on backups/ (retention lives there, not in cron).
  5. UptimeRobot heartbeat monitor for backups -> put its ping URL in /etc/bcns/heartbeat-url (mode 600).
  6. Per client: ./onboard-client.sh <slug> <port> <domain>
EOF
