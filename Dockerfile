# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:22.23.1-alpine3.24 AS build

# Toolchain for native module builds (sharp falls back to a source build
# when no prebuilt binary matches the platform)
RUN apk add --no-cache python3 make g++ vips-dev

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build \
    && pnpm prune --prod

# ---- Runtime stage ----
FROM node:22.23.1-alpine3.24

# Runtime-only system dependencies: ffmpeg for video thumbnails/metadata,
# poppler for PDF thumbnails/metadata, vips for sharp
RUN apk add --no-cache ffmpeg poppler-utils vips

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Runtime environment variables
ENV MEDIA_DIR=/media \
    CACHE_DIR=/cache \
    SITE_TITLE="Assets View" \
    PORT=2000 \
    HOST=0.0.0.0 \
    MAX_CATEGORY_DEPTH=6 \
    THUMBNAIL_CONCURRENCY=4 \
    NODE_ENV=production

# Pre-create the cache mount point owned by the runtime user so named
# volumes and bind mounts are writable without a manual chown on the host.
# (/media is mounted read-only, so its ownership doesn't matter.)
RUN mkdir -p /media /cache && chown node:node /cache

USER node

EXPOSE 2000

# Generous start-period: the / route blocks until the initial media scan
# completes, which can take minutes on a large library.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD wget -qO- http://localhost:$PORT/ || exit 1

CMD ["node", "./dist/server/entry.mjs"]
