#!/usr/bin/env bash
# Fresh DO droplet -> ready to host client apps. Run once as root.
# Rebuild-from-scratch is this script + onboard-client.sh per client +
# each client repo's deploy workflow re-run. Rehearse before client one.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ufw fail2ban unattended-upgrades rsync curl gnupg \
  nginx s3cmd openssl

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

# Every vhost below references these cert paths, so nginx cannot even load its
# config until they exist -- and the real Cloudflare Origin CA cert is a manual
# follow-up (step 2 below). Drop in a self-signed placeholder so nginx stays
# startable and onboard-client.sh works; installing the real cert overwrites it.
# Cloudflare in front means this placeholder is never what a visitor sees.
if [ ! -s /etc/ssl/cloudflare/origin.pem ] || [ ! -s /etc/ssl/cloudflare/origin.key ]; then
  echo "no Cloudflare origin cert yet -- installing a self-signed placeholder" >&2
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -subj "/CN=bcns-placeholder" \
    -keyout /etc/ssl/cloudflare/origin.key \
    -out /etc/ssl/cloudflare/origin.pem >/dev/null 2>&1
  chmod 600 /etc/ssl/cloudflare/origin.key /etc/ssl/cloudflare/origin.pem
fi

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

# Fail here rather than leaving a droplet that looks bootstrapped but whose
# nginx won't come back after the next reload or reboot.
nginx -t
systemctl reload nginx

# fail2ban: ban the scanners nginx already refuses.
#
# The stock install only jails sshd, so HTTP probing ran unlimited: one scanner
# hit l2details.com for three days straight, unbanned, before anyone noticed.
#
# `444` is the signal, and it is a precise one -- nginx only ever returns it
# where WE wrote `return 444`: the 00-default catch-all (request carried an
# unknown/absent Host header) and the `POST /` block in each client vhost.
# Neither is reachable by a real visitor, so a 444 is by definition a machine
# poking at the origin and there are no false positives to tune around.
#
# backend=auto is REQUIRED and not the default here: jail.d/defaults-debian.conf
# sets `backend = systemd` globally, which reads the journal. nginx logs to a
# FILE, so a systemd-backend jail silently matches nothing -- it starts clean,
# reports 0 failures forever, and looks like it is working.
cat > /etc/fail2ban/filter.d/nginx-refused.conf <<'EOF'
[Definition]
# combined log format; 444 = connection closed by us, no response sent
failregex = ^<HOST> - \S+ \[[^\]]*\] "[A-Z]+ [^"]*" 444 
ignoreregex =
datepattern = %%d/%%b/%%Y:%%H:%%M:%%S %%z
EOF

cat > /etc/fail2ban/jail.d/nginx-refused.conf <<'EOF'
[nginx-refused]
enabled  = true
port     = http,https
filter   = nginx-refused
logpath  = /var/log/nginx/access.log
backend  = auto
maxretry = 3
findtime = 600
bantime  = 86400
EOF

fail2ban-client reload

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
  3. /root/.s3cfg for Spaces, mode 600 (access key, secret,
     host_base = <region>.digitaloceanspaces.com, host_bucket =
     %(bucket)s.<region>.digitaloceanspaces.com). Cron runs as root, so it must
     be /root/.s3cfg -- not the .s3cfg of whoever ran this script.
     Verify with `s3cmd ls s3://<bucket>/`, NOT `s3cmd ls`: a bucket-scoped key
     gets 403 listing all buckets, which looks like broken credentials but isn't.
  4. Spaces bucket: 30-day lifecycle expiration rule on backups/ (retention lives
     there, not in cron). There is NO console UI for this -- the Settings tab
     marks lifecycle/versioning as API-only. It needs an S3 PutBucketLifecycle
     call from a FULL-ACCESS Spaces key; a bucket-scoped key returns 403 even
     with Read/Write/Delete. Create one, apply the rule, then delete the key.
  5. UptimeRobot heartbeat monitor for backups -> put its ping URL in /etc/bcns/heartbeat-url (mode 600).
  6. Per client: ./onboard-client.sh <slug> <port> <domain>
EOF
