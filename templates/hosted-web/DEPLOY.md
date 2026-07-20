# Deploy — hosted-web

Documentation only. Target stack: **Coolify** (self-hosted PaaS) building the
`Dockerfile`, fronted by **Cloudflare**, with **Neon** Postgres and **Clerk**
auth. Assumes the app has been extracted to its own repo (see README).

## Prerequisites

- A Coolify instance (self-hosted) connected to the app's git repo.
- A Neon project + database → gives you `DATABASE_URL`.
- A Clerk application → gives you `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
  `CLERK_SECRET_KEY`.
- A Stripe account → `STRIPE_SECRET_KEY` and a webhook endpoint's
  `STRIPE_WEBHOOK_SECRET`.
- (Optional) An Anthropic API key if the AI feature is opted in (`AI_ENABLED=1`
  + `ANTHROPIC_API_KEY`).

## Steps

1. **Neon** — create the database; copy the pooled connection string into
   `DATABASE_URL`.
2. **Clerk** — create the app; copy the publishable + secret keys.
3. **Coolify** — new Resource → Dockerfile build from the repo. Set the
   container port to **3100**. Add every variable from `.env.example` as
   Coolify environment variables (secrets stay in Coolify, never in the image
   or git). Deploy — Coolify builds the multi-stage `Dockerfile` and runs the
   Next.js standalone server.
4. **Stripe webhook** — point a Stripe webhook at
   `https://<your-domain>/api/stripe/webhook` for subscription events. Copy the
   signing secret into `STRIPE_WEBHOOK_SECRET`. Wire real
   `stripe.webhooks.constructEvent` verification (the route ships a documented
   stub); the provision/suspend decision already routes through
   `@bcns/app-core`.
5. **Cloudflare** — add the app's domain, proxy (orange-cloud) it to the Coolify
   host, and enable "Full (strict)" TLS. Coolify issues the origin cert.

## Notes

- No secrets are baked into the image; all keys are injected at runtime via
  Coolify env vars.
- The app boots and serves 200 even with keys absent, so a misconfigured env
  fails soft (feature-by-feature) rather than crashing the container.
