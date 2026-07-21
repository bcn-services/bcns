# infra — the shared droplet, as code

One copy per droplet (not per client repo). Pairs with each client repo's
`.github/workflows/{deploy,migrate}.yml` and `DEPLOY.md`. Platform rationale:
`~/os/knowledge/library/bcns/hosting-reference.md`.

| File | What | Run |
|---|---|---|
| `bootstrap.sh` | Fresh droplet → ready (Node 22, pg client 17, nginx + Cloudflare Origin CA TLS, ufw Cloudflare-only, fail2ban, unit template, backup cron) | once per droplet, as root |
| `onboard-client.sh` | Add a client: Unix user, `/srv/<slug>`, env file (600), scoped sudoers, nginx vhost, unit enabled | once per client: `<slug> <port> <domain>` |
| `bcns-app@.service` | systemd template unit — per-client user, `MemoryMax`, hardening | installed by bootstrap |
| `backup.sh` | Nightly `pg_dump` all clients → DO Spaces `bcns-backups/backups/`; pings an UptimeRobot heartbeat on success so silent failure alerts | cron (installed by bootstrap) |

Rebuild-from-scratch drill (rehearse before client one, note the wall-clock):
new droplet → `bootstrap.sh` → `onboard-client.sh` per client → restore env
files from secrets backup → re-run each repo's deploy workflow → point
Cloudflare at the new IP.

Not yet verified on a real droplet — first provisioning is the test.
