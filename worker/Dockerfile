# Cloud Run Job image (§5.1). tsx runs the TypeScript directly — no build step to keep in sync.
FROM node:22-slim
WORKDIR /app
# sharp ships prebuilt linux binaries; nothing else needs a toolchain.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm 10 to match CI: 11's default minimumReleaseAge policy rejects a just-refreshed lockfile.
# --prod keeps the image to the runtime tree; tsx is added on top to run the TypeScript as-is.
RUN npm i -g pnpm@10 && pnpm install --prod --frozen-lockfile --filter bcns-data && pnpm add tsx@4.20.5
COPY worker ./worker
CMD ["pnpm", "exec", "tsx", "worker/src/index.ts"]
