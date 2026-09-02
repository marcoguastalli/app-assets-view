import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import { extractMetadata } from './metadata.js';
import { queueThumbnail, pruneThumbnailAttempts } from './thumbnails.js';
import { MEDIA_DIR, isCacheDirPath } from './paths.js';
import { envInt } from './env.js';

export type MediaType = 'image' | 'video' | 'pdf' | 'text';

export interface ImageMeta {
  width?: number;
  height?: number;
  exif?: Record<string, unknown>;
}

export interface VideoMeta {
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
}

export interface PdfMeta {
  pageCount?: number;
}

export interface TextMeta {
  lineCount?: number;
}

export interface MediaItem {
  id: string;
  title: string;
  path: string;
  absolutePath: string;
  type: MediaType;
  mtime: number;
  indexedAt: number;
  size: number;
  categoryPath: string[];
  metadata: ImageMeta | VideoMeta | PdfMeta | TextMeta;
}

export interface Category {
  name: string;
  slug: string;
  path: string;
  depth: number;
  items: MediaItem[];
  subcategories: Category[];
  totalItems: number;
}

export interface MediaIndex {
  rootCategories: Category[];
  allItems: MediaItem[];
  lastUpdated: number;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.tiff', '.tif']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts']);
const PDF_EXTS   = new Set(['.pdf']);
const TEXT_EXTS  = new Set(['.txt', '.md', '.markdown', '.json', '.log', '.csv', '.yaml', '.yml']);

const MAX_DEPTH   = envInt('MAX_CATEGORY_DEPTH', 6);

// Bound concurrent file I/O during scanning. Reading image metadata opens each
// file via both sharp and exifr, so an unbounded fan-out over a large library
// blows past the process file-descriptor limit (256 by default on macOS). That
// surfaces as EBADF/EMFILE on child-process spawns (ffmpeg/pdftoppm) and stalled
// HTTP requests. Keep this well under the fd limit, leaving room for thumbnail
// generation and request handling.
const SCAN_CONCURRENCY = envInt('SCAN_CONCURRENCY', 16);

function createLimiter(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiters.shift()?.();
    }
  };
}

// Only leaf file-processing goes through the limiter — never directory recursion,
// which would deadlock (a held slot waiting on children that also need slots).
const scanLimit = createLimiter(SCAN_CONCURRENCY);

let index: MediaIndex = { rootCategories: [], allItems: [], lastUpdated: 0 };
// Rebuilt alongside the index; getItemById is on the hot path of every
// media and thumbnail request, so it must not scan allItems linearly.
let itemsById = new Map<string, MediaItem>();

export function getMediaType(filePath: string): MediaType | null {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (PDF_EXTS.has(ext))   return 'pdf';
  if (TEXT_EXTS.has(ext))  return 'text';
  return null;
}

export function makeId(relativePath: string): string {
  return relativePath.split(path.sep).map(encodeURIComponent).join('/');
}

export function idToRelativePath(id: string): string {
  return id.split('/').map(decodeURIComponent).join(path.sep);
}

/**
 * Normalize a route `[...slug]` param to a canonical media id.
 * Astro hands the slug to page routes still URL-encoded but to API endpoints
 * already decoded, so callers can't assume either form. Decode-then-encode is
 * idempotent, producing the same encoded id (matching makeId) for both.
 */
export function slugToId(slug: string): string {
  try {
    return makeId(slug.split('/').map(decodeURIComponent).join(path.sep));
  } catch {
    // Malformed percent-encoding — fall back to encoding the raw segments.
    return makeId(slug.split('/').join(path.sep));
  }
}

function titleFromFilename(filename: string): string {
  return path.basename(filename, path.extname(filename)).replace(/[-_]/g, ' ');
}

async function scanDir(
  dirPath: string,
  categoryPath: string[],
  depth: number,
  prevItemsById: Map<string, MediaItem>,
): Promise<Category> {
  const name = path.basename(dirPath);
  const slug = categoryPath.map(encodeURIComponent).join('/');
  const category: Category = {
    name,
    slug,
    path: categoryPath.join('/'),
    depth,
    items: [],
    subcategories: [],
    totalItems: 0,
  };

  let entries: Dirent[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return category;
  }

  const tasks: Promise<void>[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && depth < MAX_DEPTH) {
      if (isCacheDirPath(fullPath)) continue;
      tasks.push(
        scanDir(fullPath, [...categoryPath, entry.name], depth + 1, prevItemsById).then((sub) => {
          category.subcategories.push(sub);
        }),
      );
    } else if (entry.isFile()) {
      const mediaType = getMediaType(entry.name);
      if (!mediaType) continue;

      tasks.push(
        scanLimit(async () => {
          const stats = await stat(fullPath).catch(() => null);
          if (!stats) return;

          const relativePath = path.relative(MEDIA_DIR, fullPath);
          const id = makeId(relativePath);
          const metadata = await extractMetadata(fullPath, mediaType).catch(() => ({}));

          // A file already present in the previous index keeps its original
          // indexedAt — otherwise every full rebuild (which runs on *any*
          // filesystem change, see setupWatcher) would restamp Date.now() on
          // the entire library, making "Recently Added" reflect scan-order
          // jitter instead of genuine recency.
          const indexedAt = prevItemsById.get(id)?.indexedAt ?? Date.now();

          const item: MediaItem = {
            id,
            title: titleFromFilename(entry.name),
            path: relativePath,
            absolutePath: fullPath,
            type: mediaType,
            mtime: stats.mtimeMs,
            indexedAt,
            size: stats.size,
            categoryPath,
            metadata,
          };

          category.items.push(item);
          queueThumbnail(item);
        }),
      );
    }
  }

  await Promise.all(tasks);

  // Sort items newest-first
  category.items.sort((a, b) => b.mtime - a.mtime);
  category.subcategories.sort((a, b) => a.name.localeCompare(b.name));

  category.totalItems =
    category.items.length +
    category.subcategories.reduce((sum, s) => sum + s.totalItems, 0);

  return category;
}

async function buildIndex(): Promise<void> {
  if (MEDIA_DIR === './media') {
    console.warn(
      '[scanner] ⚠️  MEDIA_DIR is using default ./media — env var not loaded. ' +
      'If this is unintended, ensure dev script uses: "dev": "dotenv -- astro dev"'
    );
  }
  console.log('[scanner] building index from', MEDIA_DIR);
  const rootEntries = await readdir(MEDIA_DIR, { withFileTypes: true }).catch(() => []);
  const rootDirs = rootEntries.filter(
    (e) => e.isDirectory() && !isCacheDirPath(path.join(MEDIA_DIR, e.name)),
  );

  // Snapshot before itemsById is reassigned below, so already-known items
  // carry their original indexedAt forward into the rebuilt index.
  const prevItemsById = itemsById;

  const categories = await Promise.all(
    rootDirs.map((d) => scanDir(path.join(MEDIA_DIR, d.name), [d.name], 1, prevItemsById)),
  );

  const allItems: MediaItem[] = [];
  const collectItems = (cats: Category[]) => {
    for (const cat of cats) {
      allItems.push(...cat.items);
      collectItems(cat.subcategories);
    }
  };
  collectItems(categories);

  // Also scan root-level files (not in any folder)
  const rootFiles = rootEntries.filter((e) => e.isFile());
  for (const f of rootFiles) {
    const fullPath = path.join(MEDIA_DIR, f.name);
    const mediaType = getMediaType(f.name);
    if (!mediaType) continue;
    const stats = await stat(fullPath).catch(() => null);
    if (!stats) continue;
    const relativePath = f.name;
    const id = makeId(relativePath);
    const metadata = await extractMetadata(fullPath, mediaType).catch(() => ({}));
    const item: MediaItem = {
      id,
      title: titleFromFilename(f.name),
      path: relativePath,
      absolutePath: fullPath,
      type: mediaType,
      mtime: stats.mtimeMs,
      indexedAt: prevItemsById.get(id)?.indexedAt ?? Date.now(),
      size: stats.size,
      categoryPath: [],
      metadata,
    };
    allItems.push(item);
    queueThumbnail(item);
  }

  allItems.sort((a, b) => b.mtime - a.mtime);

  index = { rootCategories: categories, allItems, lastUpdated: Date.now() };
  itemsById = new Map(allItems.map((item) => [item.id, item]));
  pruneThumbnailAttempts(allItems);
}

function setupWatcher(): void {
  const watcher = chokidar.watch(MEDIA_DIR, {
    ignoreInitial: true,
    ignored: (watchedPath: string) => isCacheDirPath(watchedPath),
    depth: MAX_DEPTH,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
    // Native fs events (fsevents/inotify) are unreliable through Docker bind
    // mounts — in practice this drops addDir+add bursts for a brand-new
    // nested subfolder (e.g. mkdir + copy a file into it in one go), leaving
    // the new folder unindexed with no error until the next full restart.
    // Polling sidesteps the OS event layer entirely at the cost of some CPU;
    // 1s is well above the debounce/stability windows above so it doesn't
    // change perceived latency in practice.
    usePolling: true,
    interval: 1000,
    binaryInterval: 1000,
  });

  // Filesystem events arrive in bursts (e.g. copying a folder fires one event
  // per file). Each event triggers a *full* index rebuild, so coalesce bursts
  // into a single rebuild with a trailing debounce.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      buildIndex().catch((err) => console.error('[scanner] index rebuild failed:', err));
    }, 300);
  };
  watcher.on('add', refresh).on('unlink', refresh).on('addDir', refresh).on('unlinkDir', refresh);
}

// Initialized lazily; the promise is reused across all requests
export const ready: Promise<void> = buildIndex()
  .then(() => setupWatcher())
  .catch((err) => {
    console.error(
      '[scanner] initial index build FAILED — the library will be served empty. ' +
        'Check that MEDIA_DIR exists and is readable:',
      err,
    );
  }) as Promise<void>;

export function getMediaIndex(): MediaIndex {
  return index;
}

export function getItemById(id: string): MediaItem | undefined {
  return itemsById.get(id);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  const search = (cats: Category[]): Category | undefined => {
    for (const cat of cats) {
      if (cat.slug === slug) return cat;
      const found = search(cat.subcategories);
      if (found) return found;
    }
    return undefined;
  };
  return search(index.rootCategories);
}

export function getRecentItems(limit = 20): MediaItem[] {
  return [...index.allItems].sort((a, b) => b.indexedAt - a.indexedAt).slice(0, limit);
}
