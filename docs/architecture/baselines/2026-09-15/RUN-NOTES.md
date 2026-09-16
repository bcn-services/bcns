# platform-v1 run notes — 2026-09-15/16 (Fable 5.1, unattended)

One line per decision or correction. Repo/git history is not restated.

- bcn-services/bcns is PUBLIC; Nate (03:50 UTC 09-16): "need them all to be public so they can use free github minutes". Old repos flipped public only after a clean history secret scan; else morning step.
- platform-v1 branched from origin/main 6188584 (packages already @bcn-services/*). site/bcns-connect left untouched; its uncommitted CLAUDE.md edit is in `git stash` (stash@{0}) and re-applied on this branch.
- Droplet ufw admits 80/443 only from Cloudflare ranges — direct subdomains + HTTP-01 need `ufw allow 80,443/tcp` (droplet-wide; l2details vhost/unit/cert untouched, md5s in droplet/before.txt).
- Certbot bootstrap order in onboard-client.sh: http vhost → reload → certonly --webroot → https vhost → reload (a vhost citing a missing cert fails nginx -t).
- No Resend key exists; hub degrades to mailto. GH_PACKAGES_TOKEN missing from bcns secrets. Both = morning steps.
- Per-chunk PRs target platform-v1 and are merged onto it locally (`git merge --no-ff` + push) once their verifier passes; only platform-v1 → main is Nate's.
