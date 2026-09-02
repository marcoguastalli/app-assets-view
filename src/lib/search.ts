import type { MediaItem, MediaType } from './scanner.js';

export interface SearchIndexEntry {
  id: string;
  title: string;
  type: MediaType;
  categoryPath: string[];
  thumbnailUrl: string;
  mtime: number;
  indexedAt: number;
}

export function buildSearchIndex(items: MediaItem[]): SearchIndexEntry[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    categoryPath: item.categoryPath,
    thumbnailUrl: `/api/thumbnail/${item.id}`,
    mtime: item.mtime,
    indexedAt: item.indexedAt,
  }));
}

// Client-side filter — runs in the browser against the pre-built index
export function filterIndex(
  entries: SearchIndexEntry[],
  query: string,
  typeFilter: MediaType | 'all',
): SearchIndexEntry[] {
  const q = query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
    if (!q) return true;
    if (entry.title.toLowerCase().includes(q)) return true;
    if (entry.categoryPath.some((seg) => seg.toLowerCase().includes(q))) return true;
    return false;
  });
}
