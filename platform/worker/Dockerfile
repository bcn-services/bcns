# Cloud Run Job image (§5.1). tsx runs the TypeScript directly — no build step to keep in sync.
# Build context is the MONOREPO ROOT (docker build -f platform/worker/Dockerfile .): the lockfile
# lives there since bcns-data became platform/ (docs/architecture/platform-v1.md, chunk 1).
FROM node:22-slim
WORKDIR /app
# sharp ships prebuilt linux binaries; nothing else needs a toolchain.
# pnpm needs every workspace package.json to validate the frozen lockfile, so copy them all.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY platform/package.json platform/
COPY apps/web/package.json apps/web/
COPY apps/sb/package.json apps/sb/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
COPY packages/app-core/package.json packages/app-core/
COPY packages/data-client/package.json packages/data-client/
# pnpm pinned to the root packageManager. --prod keeps the image to the runtime tree; tsx is added on top to run the TypeScript as-is.
RUN npm i -g pnpm@9.15.0 && pnpm install --prod --frozen-lockfile --filter @bcn-services/platform && cd platform && pnpm add tsx@4.20.5
COPY platform/worker ./platform/worker
WORKDIR /app/platform
CMD ["pnpm", "exec", "tsx", "worker/src/index.ts"]
