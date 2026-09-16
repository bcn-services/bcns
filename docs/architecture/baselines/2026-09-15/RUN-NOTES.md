# platform-v1 run notes — 2026-09-15/16 (Fable 5.1, unattended)

One line per decision or correction. Repo/git history is not restated.

- bcn-services/bcns is PUBLIC; Nate (03:50 UTC 09-16): "need them all to be public so they can use free github minutes". Old repos flipped public only after a clean history secret scan; else morning step.
- platform-v1 branched from origin/main 6188584 (packages already @bcn-services/*). site/bcns-connect left untouched; its uncommitted CLAUDE.md edit is in `git stash` (stash@{0}) and re-applied on this branch.
- ~~Droplet ufw admits 80/443 only from Cloudflare ranges — needs `ufw allow 80,443/tcp`~~ **Corrected by the chunk 0 verifier (Opus 5):** `droplet/before.txt` ufw rule [17] already allows `80,443/tcp` from Anywhere (`# temp: pre-Cloudflare launch`). No ufw change is made in this run; `bootstrap.sh` keeps the Cloudflare-only loop and gains a comment.
- `/etc/letsencrypt/live` is not empty at baseline (README + `l2details.com` dir; certbot 2.9.0) — l2details.com already has a Let's Encrypt cert on disk even though its vhost serves the Cloudflare origin cert. Never touched.
- Certbot bootstrap order in onboard-client.sh: http vhost → reload → certonly --webroot → https vhost → reload (a vhost citing a missing cert fails nginx -t).
- No Resend key exists; hub degrades to mailto. GH_PACKAGES_TOKEN missing from bcns secrets. Both = morning steps.
- Per-chunk PRs target platform-v1 and are merged onto it locally (`git merge --no-ff` + push) once their verifier passes; only platform-v1 → main is Nate's.
- Chunk 1 gate (c): `supabase db diff --linked` hangs headless (keyring db password, no tty) — proven instead by Supabase MCP `list_migrations` == branch files == baseline (`pv1-gates/gate-c-migrations.txt`); the tty run is a morning step.
- Vercel preview of pv1/1-merge failed: the wizard's Build Command uses the pre-rename name `@nseluga/web` (`pv1-gates/vercel-preview.txt`). Dashboard fix is a morning step; README/CLAUDE.md now state the exact command. Gate (d) stands on the local capture (`pv1-gates/gate-d.txt`).
- Nate's uncommitted bcns-data DESIGN.md/REQUIREMENTS.md edits carried into `platform/` (78cdda9); `~/bcns-data` working tree left as-is (morning: discard them there).
- Dependency drift accepted (dev-only, dedup to root): eslint 9.39.5→9.39.4, @types/node 22.20.2→22.20.1, tsx 4.23.13→4.23.1; SB data-client registry 0.2.0 → workspace 0.3.0 (tests/typecheck/build green).
- Chunk 1 checkpoint: dt-qa (Sonnet 5) PASS; Opus 5 reviewer PASS with 8 nits (stale gate-a.txt, app-core wording, aws-sdk drift line, uncited d.ts diff, worker dry tick unproven → morning step, normalizer missing-route hole → hardened, deploy-app matrix names connect, QA under-reported app-core) — all addressed before PR B opened.
