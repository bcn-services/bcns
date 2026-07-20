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

Two build artifacts already exist and this ADR references them as the concrete
implementation of the code-sharing decision:

- [`@nseluga/app-core`](../../packages/app-core/) — the shared application-core
  package (auth wiring, DB access, AI client, billing helpers) consumed by each
  client repo.
- [`templates/hosted-web/`](../../templates/hosted-web/)
  (`@nseluga/hosted-web-template`) — the starter that spins up a new client repo
  pre-wired to the hosting stack and the shared packages.

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

**Coolify on one Hetzner VPS + Cloudflare + Neon Postgres + Clerk auth +
Stripe.**

- **Coolify on a Hetzner VPS** gives PaaS ergonomics at VPS prices, with
  per-app container isolation.
- **Neon Postgres** is the managed database (off-box, point-in-time backups).
- **Cloudflare** handles DNS, SSL, DDoS protection, and WAF.
- **Clerk** for auth; **Stripe** for billing.

**Operating cost:** roughly **$25–75/mo** to host about 10 clients. Revisit the
single-VPS / self-hosting choice only once steady spend passes **~$150–200/mo**.

#### Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Single-VPS blast radius** — one box hosting many clients is a single point of failure. | Off-box Neon Postgres backups (data survives the box); per-app container isolation so one app can't corrupt another; documented rebuild-from-template restore path. |
| **DDoS / abusive traffic** | Cloudflare WAF and DDoS protection sit in front of every app; origin only reachable through Cloudflare. |
| **Managed-service lock-in** — Neon, Clerk, Stripe, Cloudflare are all third parties. | Keep integration behind the `@nseluga/app-core` seam so a provider can be swapped without touching each client app; Postgres and Stripe are portable by design. |
| **Secret management** — API keys (incl. client Anthropic keys) must never leak. | Secrets live in Coolify/host env and encrypted at rest, never in a repo; client AI keys stored encrypted per the BYOK-AI decision. |

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
(`apps/web`), DeLuca's (`apps/delucas`), the shared packages, and the template
source. Client apps live outside it.

### Shared-package + template propagation

Shared code is **not** copied between client repos. Instead:

- Shared code lives in **versioned packages**: `@nseluga/ui`, `@nseluga/config`, and
  [`@nseluga/app-core`](../../packages/app-core/), each consumed by every client
  repo as a normal dependency.
- A **starter,
  [`templates/hosted-web/`](../../templates/hosted-web/)** (later a standalone
  GitHub Template Repository), spins up a new client repo **pre-wired** to the
  hosting stack and the shared packages.
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
- Single VPS is a shared failure domain until spend justifies splitting it
  (mitigated by off-box backups and container isolation).
- Heavier reliance on managed third parties (Neon, Clerk, Stripe, Cloudflare),
  accepted for the operational leverage and kept behind the `@nseluga/app-core`
  seam.
- bcns now owns ongoing hosting and maintenance obligations that the old
  one-time model did not carry.
