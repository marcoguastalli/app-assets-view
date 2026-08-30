import { describe, it, expect } from 'vitest';
import { sortItems } from '../../src/lib/sort.js';

const items = [
  { title: 'wp my dress up darling 059', mtime: 300 },
  { title: 'wp classroom of the elite 002', mtime: 200 },
  { title: 'wp a certain magical index 001', mtime: 100 },
];

describe('sortItems', () => {
  it('sorts A→Z alphabetically', () => {
    const result = sortItems(items, 'az');
    expect(result.map((i) => i.title)).toEqual([
      'wp a certain magical index 001',
      'wp classroom of the elite 002',
      'wp my dress up darling 059',
    ]);
  });

  it('sorts Z→A alphabetically', () => {
    const result = sortItems(items, 'za');
    expect(result.map((i) => i.title)).toEqual([
      'wp my dress up darling 059',
      'wp classroom of the elite 002',
      'wp a certain magical index 001',
    ]);
  });

  it('sorts recent (newest mtime first)', () => {
    const result = sortItems(items, 'recent');
    expect(result.map((i) => i.title)).toEqual([
      'wp my dress up darling 059',
      'wp classroom of the elite 002',
      'wp a certain magical index 001',
    ]);
  });

  it('does not mutate the original array', () => {
    const original = items.map((i) => ({ ...i }));
    sortItems(items, 'az');
    expect(items).toEqual(original);
  });

  it('handles an empty array', () => {
    expect(sortItems([], 'az')).toEqual([]);
    expect(sortItems([], 'za')).toEqual([]);
    expect(sortItems([], 'recent')).toEqual([]);
  });

  it('handles a single item', () => {
    const single = [{ title: 'only', mtime: 1 }];
    expect(sortItems(single, 'az')).toEqual(single);
  });

  it('preserves extra fields on items', () => {
    const rich = [
      { title: 'Zebra', mtime: 1, type: 'image' as const },
      { title: 'Apple', mtime: 2, type: 'video' as const },
    ];
    const result = sortItems(rich, 'az');
    expect(result[0].type).toBe('video');
    expect(result[1].type).toBe('image');
  });

  it('sorts items with equal titles stably by not crashing', () => {
    const dupes = [
      { title: 'Same', mtime: 200 },
      { title: 'Same', mtime: 100 },
    ];
    const result = sortItems(dupes, 'az');
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.title === 'Same')).toBe(true);
  });

  it('recent sort uses mtime not title order', () => {
    const byTitle = [
      { title: 'Aardvark', mtime: 1 },
      { title: 'Zebra', mtime: 3 },
      { title: 'Mango', mtime: 2 },
    ];
    const result = sortItems(byTitle, 'recent');
    expect(result.map((i) => i.title)).toEqual(['Zebra', 'Mango', 'Aardvark']);
  });
});
