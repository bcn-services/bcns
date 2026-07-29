# ADR: Hosted-Web Business & Delivery Model

- **Status:** Accepted
- **Date:** 2026-07-18 (model-migration session)
- **Supersedes:** the Part II "monorepo, one repo for all client apps; separate repos rejected" decision (see [Repo model](#repo-model-one-repo-per-client-business) below)

## Context

bcns builds custom software for local small businesses. The original plan sold
each project as a one-time build that the client would own and run themselves,
with all client apps living in a single monorepo. That model made revenue lumpy,
put ongoing hosting and maintenance on an unpriced footing, and coupled every
client's code, secrets, and deploys together.

The 2026-07-18 model-migration session locked a new model: bcns hosts and
maintains each client app as a managed service, bills a smaller setup fee plus a
recurring monthly fee, and isolates each client in its own repo. Shared code is
factored into versioned packages and a starter template so improvements
propagate without copy-paste. This ADR records those decisions and their
consequences.

The concrete implementation of the code-sharing decision is:

- [`@nseluga/app-core`](../../packages/app-core/) — the shared application-core
  package (auth wiring, DB access, AI client, billing helpers) consumed by each
  client repo.

A second artifact, `templates/hosted-web/` (`@nseluga/hosted-web-template`), was
built and then **removed** once its logic was absorbed into `app-core@0.2.0`.
[`templates/`](../../templates/) is now a placeholder for future starters.

## Decision

### Pricing & seat model

Every new hosted app is sold as **a smaller one-time setup fee plus a recurring
monthly fee**, replacing the old one-time-only model.

| Tier | One-time setup | Recurring monthly |
| --- | --- | --- |
| Standard | **$1,000** | **$149/mo** |
| Advanced | **$3,000** | **$349/mo** |

- **Seats:** 15 seats are included at the flat monthly price; beyond that,
  **$20/seat/mo**. This protects small clients and scales revenue on larger ones,
  and is trivial to explain.
- **Rationale:** recurring pricing is anchored at or above comparable
  off-the-shelf SMB team plans and justified by custom fit, hosting,
  maintenance, and taking no cut of the client's own transactions.

### AI: bring-your-own-key (BYOK-AI)

AI is an **opt-in build feature**, not a metered billing line.

- Clients **attach their own Anthropic API key**; usage is billed directly to
  the client by Anthropic. bcns never touches AI cost or liability.
- Default to a **cheap model (Haiku)**; show an in-app usage indicator so the
  client can see spend.
- The key is **stored encrypted and never committed to a repo**.
- An optional one-time "AI setup" fee covers wiring it into the app.

### Hosting stack

**One DigitalOcean droplet (systemd + nginx) + Cloudflare + Supabase (Postgres,
auth, storage) + DO Spaces + Stripe Invoicing.**

> **Revised July 2026.** This section originally specified Coolify on a Hetzner
> VPS with Neon Postgres and Clerk auth. Hetzner repriced US compute steeply
> during 2026, and Coolify/Docker was dropped in favour of building in CI and
> shipping artifacts to the box. Neon and Clerk were collapsed into Supabase,
> which provides Postgres, auth, and storage in one per-client project. The
> platform rationale of record is `~/os/knowledge/library/bcns/hosting-reference.md`;
> the provisioning scripts that implement it live in [`infra/`](../../infra/).

- **One DigitalOcean droplet** runs every client app as a systemd unit under its
  own Unix user, behind nginx. Isolation is kernel-enforced per user rather than
  per container. Provisioned by [`infra/bootstrap.sh`](../../infra/bootstrap.sh)
  and [`infra/onboard-client.sh`](../../infra/onboard-client.sh).
- **Supabase** is the managed database, auth, and file storage — **one project
  per client**, so tenant isolation is at the database level and a query cannot
  cross clients by construction.
- **Cloudflare** handles DNS, SSL, DDoS protection, and WAF; the droplet
  firewall only accepts web traffic from Cloudflare ranges.
- **DO Spaces** stores nightly `pg_dump` backups off-box
  ([`infra/backup.sh`](../../infra/backup.sh)), with a heartbeat monitor so a
  silent backup failure alerts.
- **Stripe Invoicing** collects the bcns monthly fee **centrally, from bcns's own
  account**. Client repos contain no bcns-billing code.
- **Deploys** are built in CI and shipped as artifacts — the production box never
  builds. GitHub Actions builds, rsyncs to `releases/<sha>`, flips a `current`
  symlink, restarts the unit, health-checks, and rolls back on failure.

**Operating cost:** roughly **$54–59/mo** for the first client and about
**$10/mo** per additional client (a new Supabase project on shared compute).
Revisit the single-droplet choice once steady spend passes **~$150–200/mo**.

#### Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Single-droplet blast radius** — one box hosting many clients is a single point of failure. | Off-box Supabase Postgres plus nightly `pg_dump` to DO Spaces (data survives the box); per-Unix-user isolation so one app cannot read another's secrets; documented rebuild-from-scratch drill in `infra/README.md`. |
| **DDoS / abusive traffic** | Cloudflare WAF and DDoS protection sit in front of every app; UFW only allows 80/443 from Cloudflare ranges, so the origin is unreachable directly. |
| **Managed-service lock-in** — Supabase, Stripe, Cloudflare, DigitalOcean are all third parties. | Keep integration behind the `@nseluga/app-core` seam so a provider can be swapped without touching each client app; Postgres and Stripe are portable by design. |
| **Secret management** — API keys (incl. client Anthropic keys) must never leak. | Secrets live in a per-client env file on the droplet (mode 600, owned by that client's Unix user) or the Supabase vault, never in a repo; client AI keys stored encrypted per the BYOK-AI decision. |

### Repo model: one repo per client business

**Each client business gets its own repo.** This **reverses the old Part II
"monorepo, separate repos rejected" decision.**

Reasons for the reversal:

- **Per-client isolation** of code, secrets, and deploys.
- **Clean handoff / offboarding** — a single repo can be transferred or deleted
  without disentangling it from others.
- **Independent deploy cadence** — one client ships without waiting on or
  risking another.
- **Smaller security blast radius** — a compromise or mistake is contained to
  one client.

The bcns monorepo remains the **platform repo**: it holds the marketing site
(`apps/web`), the shared packages, and the droplet provisioning scripts in
[`infra/`](../../infra/). Client apps live
outside it — including DeLuca's, which was extracted to its own repo
`bcns-client-delucas` (its desktop-app exception is documented in `SETUP.md`).

### Shared-package + template propagation

Shared code is **not** copied between client repos. Instead:

- Shared code lives in **versioned packages**: `@nseluga/ui`, `@nseluga/config`, and
  [`@nseluga/app-core`](../../packages/app-core/), each consumed by every client
  repo as a normal dependency.
- A **starter** spins up a new client repo **pre-wired** to the hosting stack and
  the shared packages. The original `templates/hosted-web/` copy was **removed**
  once its logic was absorbed into `@nseluga/app-core@0.2.0`; the replacement
  will be a standalone GitHub Template Repository. Until it exists, new client
  repos are wired by hand against the shared packages. See
  [`templates/README.md`](../../templates/README.md).
- **Propagation:** improve a package once, publish a new version, and **bump the
  version across client repos** to roll the improvement out. No hand-editing of
  each app.

## Consequences

**Positive**

- Predictable recurring revenue plus per-seat upside, on top of setup fees.
- AI cost and liability sit entirely with the client (BYOK-AI); bcns carries no
  metered AI risk.
- Low, transparent hosting cost (~$25–75/mo for ~10 clients) with a clear
  trigger (~$150–200/mo) for revisiting the architecture.
- Strong per-client isolation: independent deploys, clean offboarding, contained
  security blast radius.
- Shared improvements propagate by version bump instead of copy-paste, keeping
  client apps consistent and cheap to maintain.

**Negative / trade-offs**

- Many repos to operate instead of one; per-client setup and dependency-bump
  overhead (mitigated by the template and versioned packages).
- A single droplet is a shared failure domain until spend justifies splitting it
  (mitigated by off-box Supabase data and nightly backups to DO Spaces).
- Heavier reliance on managed third parties (Supabase, Stripe, Cloudflare,
  DigitalOcean), accepted for the operational leverage and kept behind the
  `@nseluga/app-core` seam.
- bcns now owns ongoing hosting and maintenance obligations that the old
  one-time model did not carry.
