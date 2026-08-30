import path from 'node:path';

export const MEDIA_DIR = process.env.MEDIA_DIR || './media';
export const CACHE_DIR = process.env.CACHE_DIR || './cache';
export const THUMB_DIR = path.join(CACHE_DIR, 'thumbnails');

/**
 * Resolve `userPath` against `base` and confirm the result stays inside `base`.
 * Returns the absolute path, or null if it would escape the base directory
 * (path-traversal guard). This is the single source of truth for that check —
 * do not re-implement it inline in route handlers.
 */
export function safePath(base: string, userPath: string): string | null {
  const resolved = path.resolve(base, userPath);
  const resolvedBase = path.resolve(base);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * True if `target` is CACHE_DIR itself or lives inside it. CACHE_DIR is
 * allowed to be nested under MEDIA_DIR (e.g. a subfolder of the media
 * library); when it is, the scanner and watcher must exclude it or they
 * index their own generated thumbnails as media, which spawns thumbnails
 * of thumbnails in an unbounded loop.
 */
export function isCacheDirPath(target: string): boolean {
  const resolved = path.resolve(target);
  const resolvedCache = path.resolve(CACHE_DIR);
  return resolved === resolvedCache || resolved.startsWith(resolvedCache + path.sep);
}
