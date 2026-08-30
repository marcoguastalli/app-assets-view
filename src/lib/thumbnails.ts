import { mkdir, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import type { MediaItem } from './scanner.js';
import { THUMB_DIR } from './paths.js';
import { envInt } from './env.js';

const execFileAsync = promisify(execFile);

const CONCURRENCY      = envInt('THUMBNAIL_CONCURRENCY', 4);
const THUMB_WIDTH      = 400;
const THUMB_HEIGHT     = 225;

// Simple concurrency-limited queue
const queue: Array<() => Promise<void>> = [];
let running = 0;

function drainQueue() {
  while (running < CONCURRENCY && queue.length > 0) {
    const task = queue.shift()!;
    running++;
    task().finally(() => {
      running--;
      drainQueue();
    });
  }
}

// The scanner rebuilds the whole index on every change, so queueThumbnail is
// called for every item on every rebuild. Track what we've already attempted
// (keyed by id + mtime, so an edited file still regenerates) to avoid piling up
// redundant tasks. We keep the key even on failure: a permanently-failing source
// (e.g. a missing ffmpeg/pdftoppm binary) must not be re-spawned on every rebuild
// — that's a spawn storm that can exhaust file descriptors. A new mtime or a
// process restart will retry.
const attempted = new Set<string>();

const attemptKey = (item: MediaItem) => `${item.id}:${item.mtime}`;

/**
 * Drop attempt-tracking for items no longer in the index. Called by the
 * scanner after each rebuild — without this, every file edit/rename/delete
 * leaves a stale key behind forever.
 */
export function pruneThumbnailAttempts(items: MediaItem[]): void {
  const valid = new Set(items.map(attemptKey));
  for (const key of attempted) {
    if (!valid.has(key)) attempted.delete(key);
  }
}

export function queueThumbnail(item: MediaItem): void {
  const key = attemptKey(item);
  if (attempted.has(key)) return;
  attempted.add(key);

  queue.push(() => generateThumbnail(item).then(() => undefined));
  drainQueue();
}

// On-demand requests (the /api/thumbnail route) go through the same queue as
// background generation so the total number of concurrent sharp/ffmpeg/pdftoppm
// jobs stays bounded by CONCURRENCY — a burst of requests for uncached thumbs
// must not spawn one process per request. They jump the queue (unshift) so a
// page load isn't stuck behind a full-library rescan, and concurrent requests
// for the same item share a single generation task.
const inflight = new Map<string, Promise<string | null>>();

export async function requestThumbnail(item: MediaItem): Promise<string | null> {
  if (await thumbnailExists(item)) return thumbnailPath(item);

  let pending = inflight.get(item.id);
  if (!pending) {
    pending = new Promise<string | null>((resolve) => {
      queue.unshift(() => generateThumbnail(item).then(resolve));
      drainQueue();
    }).finally(() => inflight.delete(item.id));
    inflight.set(item.id, pending);
  }
  return pending;
}

// Cache filenames are a digest of the id. Ids contain arbitrary user-named
// path segments, and any lossy sanitization collides (the previous
// character-replacement scheme mapped e.g. "a.b.jpg" and "a!b.jpg" to the
// same file, serving one item's thumbnail for another). A digest is
// collision-free and filesystem-safe.
//
// Sharded into 256 subfolders by the digest's first two hex chars (the same
// scheme Git uses for loose objects) — a large library means tens of
// thousands of thumbnails, and most filesystems slow down once a single
// directory holds that many entries.
export function thumbnailPathForId(id: string): string {
  const digest = createHash('sha1').update(id).digest('hex');
  return path.join(THUMB_DIR, digest.slice(0, 2), `${digest}.jpg`);
}

export function thumbnailPath(item: MediaItem): string {
  return thumbnailPathForId(item.id);
}

export async function thumbnailExists(item: MediaItem): Promise<boolean> {
  const thumbPath = thumbnailPath(item);
  try {
    const [thumbStat, srcStat] = await Promise.all([stat(thumbPath), stat(item.absolutePath)]);
    // Thumbnail is valid if it exists and is newer than source
    return thumbStat.mtimeMs >= srcStat.mtimeMs;
  } catch {
    return false;
  }
}

export async function generateThumbnail(item: MediaItem): Promise<string | null> {
  if (await thumbnailExists(item)) return thumbnailPath(item);

  const outPath = thumbnailPath(item);
  await mkdir(path.dirname(outPath), { recursive: true });

  try {
    switch (item.type) {
      case 'image':  await generateImageThumbnail(item.absolutePath, outPath); break;
      case 'video':  await generateVideoThumbnail(item.absolutePath, outPath); break;
      case 'pdf':    await generatePdfThumbnail(item.absolutePath, outPath);   break;
      // No generated preview for text files — the card always falls back
      // to the placeholder icon with a "text" badge.
      case 'text':   return null;
    }
    return outPath;
  } catch (err) {
    console.error(`Thumbnail generation failed for ${item.path}:`, err);
    return null;
  }
}

async function generateImageThumbnail(src: string, out: string): Promise<void> {
  const sharp = (await import('sharp')).default;
  await sharp(src)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80 })
    .toFile(out);
}

async function generateVideoThumbnail(src: string, out: string): Promise<void> {
  // Get duration first
  let duration = 0;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      src,
    ]);
    const data = JSON.parse(stdout) as { format?: { duration?: string } };
    duration = parseFloat(data.format?.duration || '0') || 0;
  } catch {
    // Use 0 if ffprobe fails
  }

  const seekTime = Math.max(duration * 0.1, 0);
  const seekStr = String(seekTime.toFixed(3));

  await execFileAsync('ffmpeg', [
    '-ss', seekStr,
    '-i', src,
    '-vframes', '1',
    '-vf', `scale=${THUMB_WIDTH}:${THUMB_HEIGHT}:force_original_aspect_ratio=increase,crop=${THUMB_WIDTH}:${THUMB_HEIGHT}`,
    '-q:v', '2',
    '-y',
    out,
  ]);
}

async function generatePdfThumbnail(src: string, out: string): Promise<void> {
  const tmpPrefix = out.replace(/\.jpg$/, '_tmp');

  await execFileAsync('pdftoppm', [
    '-jpeg',
    '-r', '72',
    '-f', '1',
    '-l', '1',
    '-scale-to-x', String(THUMB_WIDTH),
    '-scale-to-y', '-1',
    src,
    tmpPrefix,
  ]);

  // pdftoppm's page-number suffix width depends on the source PDF's page
  // count (e.g. "-001.jpg" vs "-000001.jpg"), so find whatever it actually
  // wrote rather than assuming a fixed width.
  const tmpDir = path.dirname(tmpPrefix);
  const tmpName = path.basename(tmpPrefix);
  const entries = await readdir(tmpDir);
  const tmpFileName = entries.find((f) => f.startsWith(`${tmpName}-`) && f.endsWith('.jpg'));
  if (!tmpFileName) {
    throw new Error(`pdftoppm did not produce an output file for ${tmpPrefix}`);
  }
  const tmpFile = path.join(tmpDir, tmpFileName);

  const sharp = (await import('sharp')).default;
  await sharp(tmpFile)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'north' })
    .jpeg({ quality: 80 })
    .toFile(out);

  // Clean up tmp file
  const { unlink } = await import('node:fs/promises');
  await unlink(tmpFile).catch(() => null);
}

export function thumbnailUrl(item: MediaItem): string {
  return `/api/thumbnail/${item.id}`;
}
