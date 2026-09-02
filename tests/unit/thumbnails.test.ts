import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// We test the path-derivation logic without invoking sharp/ffmpeg
vi.mock('node:fs/promises', () => ({
  mkdir:  vi.fn().mockResolvedValue(undefined),
  stat:   vi.fn().mockRejectedValue(new Error('ENOENT')),
  unlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('sharp', () => ({ default: vi.fn() }));

import { thumbnailPath, thumbnailUrl, requestThumbnail } from '../../src/lib/thumbnails.js';
import type { MediaItem } from '../../src/lib/scanner.js';

function makeItem(partialPath: string, type: 'image' | 'video' | 'pdf' = 'image'): MediaItem {
  return {
    id: partialPath.split('/').map(encodeURIComponent).join('/'),
    title: 'Test',
    path: partialPath,
    absolutePath: `/media/${partialPath}`,
    type,
    mtime: Date.now(),
    indexedAt: Date.now(),
    size: 1024,
    categoryPath: [],
    metadata: {},
  };
}

describe('thumbnailUrl', () => {
  it('always returns the API URL for the item', () => {
    const item = makeItem('Movies/clip.mp4', 'video');
    expect(thumbnailUrl(item)).toBe(`/api/thumbnail/${item.id}`);
  });

  it('returns a string synchronously', () => {
    const item = makeItem('Photos/img.jpg');
    const result = thumbnailUrl(item);
    expect(typeof result).toBe('string');
  });
});

describe('requestThumbnail', () => {
  it('shares one generation task across concurrent requests for the same item', async () => {
    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>;
    sharp.mockClear();

    const item = makeItem('Photos/dedupe.jpg');
    const [a, b] = await Promise.all([requestThumbnail(item), requestThumbnail(item)]);

    // Generation fails under the sharp mock, so both callers get the
    // null fallback — but from a single shared attempt.
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(sharp).toHaveBeenCalledTimes(1);
  });
});

describe('thumbnailPath', () => {
  it('returns a path ending in .jpg', () => {
    const item = makeItem('Photography/photo.jpg');
    expect(thumbnailPath(item)).toMatch(/\.jpg$/);
  });

  it('is deterministic for the same item', () => {
    expect(thumbnailPath(makeItem('Movies/clip.mp4', 'video')))
      .toBe(thumbnailPath(makeItem('Movies/clip.mp4', 'video')));
  });

  it('does not collide for ids that sanitize to the same string', () => {
    // Under the old character-replacement scheme both of these mapped to
    // "a_b_jpg.jpg" and one item's thumbnail was served for the other.
    const p1 = thumbnailPath(makeItem('Docs/a.b.jpg'));
    const p2 = thumbnailPath(makeItem('Docs/a!b.jpg'));
    expect(p1).not.toBe(p2);
  });

  it('produces a flat filesystem-safe filename for special characters', () => {
    const item = makeItem('Italy 2024/photo #1 (edited).jpg');
    const p = thumbnailPath(item);
    expect(path.basename(p)).toMatch(/^[0-9a-f]{40}\.jpg$/);
  });
});
