# infra — the shared droplet, as code

One copy per droplet (not per client repo). Pairs with each client repo's
`.github/workflows/{deploy,migrate}.yml` and `DEPLOY.md`. Platform rationale:
`~/os/knowledge/library/bcns/hosting-reference.md`.

| File | What | Run |
|---|---|---|
| `bootstrap.sh` | Fresh droplet → ready (Node 22, pg client 17, nginx + Cloudflare Origin CA TLS, ufw Cloudflare-only, fail2ban, unit template, backup cron) | once per droplet, as root |
| `onboard-client.sh` | Add a client: Unix user, `/srv/<slug>`, env file (600), scoped sudoers, nginx vhost, unit enabled. TLS by 4th arg: `cloudflare` (origin cert, hosts behind Cloudflare), `certbot` (Let's Encrypt HTTP-01, default for `*.bcn-services.com`), or an absolute cert dir | once per client: `<slug> <port> <domain> [cloudflare\|certbot\|<cert-dir>]`; slug/port must already be in `ports.txt` |
| `ports.txt` | Registry `slug port` for every app on the droplet; `onboard-client.sh` refuses unregistered slugs and collisions, `scripts/new-app.sh` appends | scp next to `onboard-client.sh` |
| `bcns-app@.service` | systemd template unit — per-client user, `MemoryMax`, hardening | installed by bootstrap |
| `backup.sh` | Nightly `pg_dump` all clients → DO Spaces `bcns-web-apps-backups/backups/`; pings an UptimeRobot heartbeat on success so silent failure alerts | cron (installed by bootstrap) |

Rebuild-from-scratch drill (rehearse before client one, note the wall-clock):
new droplet → `bootstrap.sh` → `onboard-client.sh` per client → restore env

Direct hosts (no Cloudflare, e.g. `sb.bcn-services.com`) need port 80/443 open from anywhere for HTTP-01 — the live droplet already has that ufw rule; `bootstrap.sh` only comments on it.
files from secrets backup → re-run each repo's deploy workflow → point
Cloudflare at the new IP.

Not yet verified on a real droplet — first provisioning is the test.
