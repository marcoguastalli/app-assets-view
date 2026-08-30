/**
 * Integration tests — verify the media index is built correctly from fixtures.
 *
 * Run with: vitest run tests/integration
 *
 * Requires: test-fixtures/media directory with sample files.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'node:path';

// Point scanner at test fixtures instead of real media
process.env.MEDIA_DIR = path.resolve('./tests/fixtures/media');
process.env.CACHE_DIR = path.resolve('./tests/fixtures/.cache');
process.env.MAX_CATEGORY_DEPTH = '3';
process.env.THUMBNAIL_CONCURRENCY = '1';

// Prevent actual thumbnail generation in integration tests
vi.mock('../../src/lib/thumbnails.js', () => ({
  queueThumbnail: vi.fn(),
  pruneThumbnailAttempts: vi.fn(),
  requestThumbnail: vi.fn().mockResolvedValue(null),
  thumbnailPath:  vi.fn().mockReturnValue('/tmp/thumb.jpg'),
  thumbnailPathForId: vi.fn().mockReturnValue('/tmp/thumb.jpg'),
  thumbnailExists:vi.fn().mockResolvedValue(false),
  generateThumbnail: vi.fn().mockResolvedValue(null),
  thumbnailUrl:   vi.fn().mockReturnValue('/placeholder-thumb.svg'),
}));

// Import after env is set
const { ready, getMediaIndex, getItemById } = await import('../../src/lib/scanner.js');

describe('MediaIndex', () => {
  beforeAll(async () => {
    await ready;
  });

  it('builds an index without errors', () => {
    const { allItems, rootCategories, lastUpdated } = getMediaIndex();
    expect(lastUpdated).toBeGreaterThan(0);
    expect(Array.isArray(allItems)).toBe(true);
    expect(Array.isArray(rootCategories)).toBe(true);
  });

  it('finds items by ID', () => {
    const { allItems } = getMediaIndex();
    if (allItems.length === 0) return; // No fixtures present
    const first = allItems[0];
    expect(getItemById(first.id)).toEqual(first);
  });

  it('items have required fields', () => {
    const { allItems } = getMediaIndex();
    for (const item of allItems) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.path).toBeTruthy();
      expect(['image', 'video', 'pdf']).toContain(item.type);
      expect(item.mtime).toBeGreaterThan(0);
    }
  });
});
