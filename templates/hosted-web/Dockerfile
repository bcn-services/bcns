# Multi-stage Next.js build for the hosted-web template.
#
# This Dockerfile assumes the app has been EXTRACTED to its own repo (see
# README "Extracting to its own repo"): workspace:* deps are now versioned
# @bcns/* registry deps, so a plain `pnpm install` resolves everything and the
# monorepo root is no longer needed. Build context = this app's own root.
#
#   docker build -t hosted-web .
#   docker run -p 3100:3100 --env-file .env.local hosted-web

# ---- deps: install production + build deps against the lockfile -------------
FROM node:20-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN corepack pnpm install --frozen-lockfile

# ---- build: compile the Next.js standalone server ---------------------------
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack pnpm build

# ---- run: minimal runtime image using Next standalone output ----------------
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
# Non-root runtime user.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3100
# Secrets are provided at runtime via env (--env-file / Coolify env), never baked
# into the image.
CMD ["node", "server.js"]
