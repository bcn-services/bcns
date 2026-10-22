# infra — the shared droplet, as code

One copy per droplet (not per client repo). Pairs with each client repo's
`.github/workflows/{deploy,migrate}.yml` and `DEPLOY.md`. Platform rationale:
`~/os/knowledge/library/bcns/hosting-reference.md`.

| File | What | Run |
|---|---|---|
| `bootstrap.sh` | Fresh droplet → ready (Node 22, pg client 17, nginx + Cloudflare Origin CA TLS, ufw Cloudflare-only, fail2ban, unit template, backup cron) | once per droplet, as root |
| `onboard-client.sh` | Add a client: Unix user, `/srv/<slug>`, env file (600), scoped sudoers, nginx vhost, unit enabled. TLS by 4th arg: `cloudflare` (origin cert, hosts behind Cloudflare), `certbot` (Let's Encrypt HTTP-01, default for `*.bcn-services.com`), or an absolute cert dir. 5th arg picks which Supabase env var names the env file seeds: `next` (`NEXT_PUBLIC_SUPABASE_*`, the default) or `mcp` (bare `SUPABASE_URL`/`SUPABASE_ANON_KEY`, for apps/mcp) | once per client: `<slug> <port> <domain> [cloudflare\|certbot\|<cert-dir>] [next\|mcp]`; slug/port must already be in `ports.txt` |
| `ports.txt` | Registry `slug port` for every app on the droplet; `onboard-client.sh` refuses unregistered slugs and collisions, `scripts/new-app.sh` appends | scp next to `onboard-client.sh` |
| `bcns-app@.service` | systemd template unit — per-client user, `MemoryMax`, hardening | installed by bootstrap |
| `backup.sh` | Nightly `pg_dump` all clients → DO Spaces `bcns-web-apps-backups/backups/`; pings an UptimeRobot heartbeat on success so silent failure alerts | cron (installed by bootstrap) |

Rebuild-from-scratch drill, run for real 2026-10-21/22 (sfo3 -> nyc3, 104.236.20.89). Order that worked:
new droplet -> `cloud-init status --wait` -> `bootstrap.sh` -> `ufw allow 80,443/tcp` -> copy `/etc/letsencrypt` from the old box (certbot-mode onboarding skips issuance when the cert is there; issuing first needs DNS already flipped) -> `onboard-client.sh` per slug -> copy env files, deploy `authorized_keys`, `/etc/bcns/{backup-dbs,heartbeat-url}`, `/root/.s3cfg` (all manual, key-name diff only) -> rotate `DEPLOY_HOST` -> `workflow_dispatch` each slug -> `curl --resolve` check -> lower A-record TTL to 300 and wait out the old TTL -> flip A records -> `certbot renew --dry-run` -> manual `bcns-backup`.

Gaps hit (not automated):
- First `bootstrap.sh` run fails on the apt/dpkg lock from first-boot cloud-init; wait for `cloud-init status --wait`, rerun.
- ufw is Cloudflare-only in the script; direct hosts need `80,443 Anywhere` added by hand. Live sshd also has `PermitRootLogin yes`, which bootstrap does not set.
- Origin cert is a self-signed placeholder until real certs are copied or issued.
- `certbot renew --dry-run` fails until DNS points at the box; expected before the flip.
- DO droplet backups (weekly), resource alerts and a cloud firewall are console steps, never in the script. sfo3 had none.
- Squarespace DNS edits need a Google re-verify per session; TTL has no 5-min preset (use Custom 300).
- Timing: `/api/health` from the laptop is distance-dominated, not comparable across boxes. NYC droplet to Supabase: TCP connect ~4 ms, `/auth/v1/health` ~90-100 ms total (was ~0.15-0.3 s per call from sfo3).
