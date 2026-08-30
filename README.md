# App Assets View

A personal, self-hosted app to view assets — images, videos, PDFs, and plain-text files — from your filesystem through a web UI.

Filesystem is the **source of truth**. No database, no login required.

## Build

Requires Node 22, pnpm, and, for full video/PDF support, `ffmpeg`/`ffprobe` and `pdftoppm`/`pdfinfo` (poppler-utils) on `PATH` (`brew install poppler` on macOS).

```bash
pnpm install
pnpm run build      # -> dist/
pnpm run start      # HOST=0.0.0.0 node ./dist/server/entry.mjs
```

Or build a container image directly:

```bash
docker build -t app-assets-view .
```

## Deploy

### Docker Compose (recommended)

```bash
docker compose up --build -d
```

This builds the image locally, mounts a media folder read-only at `/media`, and persists thumbnails in a named `cache` volume. Edit the `volumes:` source path in [docker-compose.yml](docker-compose.yml) to point at your media library, and the `ports:` mapping if you need it reachable beyond `localhost`.

**The app has no authentication** — anything under the mounted media folder is servable to anyone who can reach the port. Keep it on a trusted network, bind it to `127.0.0.1`, or put a reverse proxy with auth in front for remote access.

### Prebuilt image from GHCR

Every push to `main` and every `vX.Y.Z` tag publishes a multi-arch (amd64/arm64) image via GitHub Actions ([.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)):

```bash
docker pull ghcr.io/marcoguastalli/app-assets-view:latest
docker run -d \
  -p 2000:2000 \
  -v /path/to/media:/media:ro \
  -v app-assets-cache:/cache \
  ghcr.io/marcoguastalli/app-assets-view:latest
```

### Configuration

All configuration is via environment variables (see [.env.example](.env.example) for local-dev values; Docker deployments set these directly, see [docker-compose.yml](docker-compose.yml)):

| Variable | Default when unset | Purpose |
|---|---|---|
| `MEDIA_DIR` | `./media` | Root folder to scan and serve |
| `CACHE_DIR` | `./cache` | Where thumbnails are cached |
| `SITE_TITLE` | `Assets View` | Displayed in the UI |
| `PORT` | `2000` | HTTP port |
| `MAX_CATEGORY_DEPTH` | `6` | How many folder levels deep to scan |
| `THUMBNAIL_CONCURRENCY` | `4` | Parallel thumbnail generation jobs |
