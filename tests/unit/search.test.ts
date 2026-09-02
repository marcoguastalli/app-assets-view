import { describe, it, expect } from 'vitest';
import { filterIndex } from '../../src/lib/search.js';
import type { SearchIndexEntry } from '../../src/lib/search.js';

const entries: SearchIndexEntry[] = [
  { id: '1', title: 'Sunset in Italy', type: 'image', categoryPath: ['Photography', 'Italy 2024'], thumbnailUrl: '', mtime: 1000, indexedAt: 1000 },
  { id: '2', title: 'Mountain Hike',   type: 'video', categoryPath: ['Videos', 'Outdoors'],        thumbnailUrl: '', mtime: 2000, indexedAt: 2000 },
  { id: '3', title: 'Annual Report',   type: 'pdf',   categoryPath: ['Documents'],                  thumbnailUrl: '', mtime: 3000, indexedAt: 3000 },
  { id: '4', title: 'Beach Sunset',    type: 'image', categoryPath: ['Photography', 'Summer'],      thumbnailUrl: '', mtime: 4000, indexedAt: 4000 },
];

describe('filterIndex', () => {
  it('returns all entries for empty query and all type', () => {
    expect(filterIndex(entries, '', 'all')).toHaveLength(4);
  });

  it('filters by title (case-insensitive)', () => {
    const res = filterIndex(entries, 'sunset', 'all');
    expect(res).toHaveLength(2);
    expect(res.map((e) => e.id)).toEqual(expect.arrayContaining(['1', '4']));
  });

  it('filters by category path', () => {
    const res = filterIndex(entries, 'italy', 'all');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('1');
  });

  it('filters by media type', () => {
    const res = filterIndex(entries, '', 'image');
    expect(res).toHaveLength(2);
    expect(res.every((e) => e.type === 'image')).toBe(true);
  });

  it('combines query and type filter', () => {
    const res = filterIndex(entries, 'sunset', 'image');
    expect(res).toHaveLength(2);
    expect(res.every((e) => e.type === 'image')).toBe(true);
  });

  it('returns empty for no matches', () => {
    expect(filterIndex(entries, 'xyznonexistent', 'all')).toHaveLength(0);
  });

  it('filters by pdf type', () => {
    const res = filterIndex(entries, '', 'pdf');
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('pdf');
  });
});
