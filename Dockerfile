# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build-workspace
ARG API_INTERNAL_URL=https://api.clipsubtitles.com
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/transcription/package.json packages/transcription/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/render/package.json packages/render/package.json
COPY packages/render-remotion/package.json packages/render-remotion/package.json
COPY packages/server/package.json packages/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

FROM build-workspace AS server-build
RUN pnpm --filter @clipsubtitles/server build

FROM build-workspace AS web-build
RUN pnpm --filter @clipsubtitles/web build

# Production dependencies are resolved on the target architecture so native
# canvas binaries match Cloud Run even when an ARM development machine builds
# a linux/amd64 image. Compilation stays on BUILDPLATFORM to avoid QEMU/Go
# instability in esbuild.
FROM --platform=$TARGETPLATFORM node:24-bookworm-slim AS server-deploy
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/transcription/package.json packages/transcription/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/render/package.json packages/render/package.json
COPY packages/render-remotion/package.json packages/render-remotion/package.json
COPY packages/server/package.json packages/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm-target,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @clipsubtitles/server deploy --prod --legacy /output/server

FROM node:24-bookworm-slim AS media-runtime
ENV NODE_ENV=production \
    DATA_DIR=/tmp/clipsubtitles \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 clipsubtitles \
 && useradd --system --uid 10001 --gid clipsubtitles --home-dir /nonexistent --shell /usr/sbin/nologin clipsubtitles \
 && mkdir -p /app /tmp/clipsubtitles \
 && chown -R clipsubtitles:clipsubtitles /app /tmp/clipsubtitles
WORKDIR /app
COPY --from=server-deploy --chown=clipsubtitles:clipsubtitles /output/server ./
COPY --from=server-build --chown=clipsubtitles:clipsubtitles /workspace/packages/server/dist ./dist
USER clipsubtitles
RUN node dist/runtime-check.js
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM media-runtime AS api
ENV PORT=8080 API_PORT=8080
EXPOSE 8080
CMD ["node", "--no-warnings=ExperimentalWarning", "dist/api.js"]

FROM media-runtime AS worker
ENV PORT=8080 API_PORT=8080
EXPOSE 8080
CMD ["node", "--no-warnings=ExperimentalWarning", "dist/worker-push.js"]

FROM node:24-bookworm-slim AS web
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 10001 clipsubtitles \
 && useradd --system --uid 10001 --gid clipsubtitles --home-dir /nonexistent --shell /usr/sbin/nologin clipsubtitles
COPY --from=web-build --chown=clipsubtitles:clipsubtitles /workspace/apps/web/.next/standalone ./
COPY --from=web-build --chown=clipsubtitles:clipsubtitles /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=clipsubtitles:clipsubtitles /workspace/apps/web/public ./apps/web/public
USER clipsubtitles
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
