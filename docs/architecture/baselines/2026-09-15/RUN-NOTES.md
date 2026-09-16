# platform-v1 run notes — 2026-09-15/16 (Fable 5.1, unattended)

One line per decision or correction. Repo/git history is not restated.

- bcn-services/bcns is PUBLIC; Nate (03:50 UTC 09-16): "need them all to be public so they can use free github minutes". Old repos flipped public only after a clean history secret scan; else morning step.
- platform-v1 branched from origin/main 6188584 (packages already @bcn-services/*). site/bcns-connect left untouched; its uncommitted CLAUDE.md edit is in `git stash` (stash@{0}) and re-applied on this branch.
- ~~Droplet ufw admits 80/443 only from Cloudflare ranges — needs `ufw allow 80,443/tcp`~~ **Corrected by the chunk 0 verifier (Opus 5):** `droplet/before.txt` ufw rule [17] already allows `80,443/tcp` from Anywhere (`# temp: pre-Cloudflare launch`). No ufw change is made in this run; `bootstrap.sh` keeps the Cloudflare-only loop and gains a comment.
- `/etc/letsencrypt/live` is not empty at baseline (README + `l2details.com` dir; certbot 2.9.0) — l2details.com already has a Let's Encrypt cert on disk even though its vhost serves the Cloudflare origin cert. Never touched.
- Certbot bootstrap order in onboard-client.sh: http vhost → reload → certonly --webroot → https vhost → reload (a vhost citing a missing cert fails nginx -t).
- No Resend key exists; hub degrades to mailto. GH_PACKAGES_TOKEN missing from bcns secrets. Both = morning steps.
- Per-chunk PRs target platform-v1 and are merged onto it locally (`git merge --no-ff` + push) once their verifier passes; only platform-v1 → main is Nate's.
- Chunk 2: Opus 5 infra review of 7dec700 = SAFE TO RUN + 6 should-fix; all applied in 864c132/57bba92 (idempotent useradd, env/vhost guards, renewal deploy hook, comment-safe registry). Live 00-default already had the :80 default_server 444 block; repo heredoc realigned (md5 3ec5a9fe…). l2details.com renewal is webroot, not standalone.
- Chunk 2 droplet: sb/connect/mcp onboarded with Let's Encrypt certs (expire 2026-12-15); deploy key logs in as all three slugs; connect.env appended to /srv/connect/env (never printed). l2detailz vhost/unit/00-default md5 identical before/after. Gate (g) TLS half proven pre-deploy (502 until chunk 4 deploys apps).
