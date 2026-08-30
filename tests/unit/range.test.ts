import { describe, it, expect } from 'vitest';
import { parseRange } from '../../src/lib/range.js';

describe('parseRange', () => {
  const SIZE = 1000;

  it('returns null when there is no Range header', () => {
    expect(parseRange(null, SIZE)).toBeNull();
  });

  it('returns null for malformed headers', () => {
    expect(parseRange('garbage', SIZE)).toBeNull();
    expect(parseRange('bytes=-', SIZE)).toBeNull();
  });

  it('parses a bounded range', () => {
    expect(parseRange('bytes=0-499', SIZE)).toEqual({ start: 0, end: 499 });
  });

  it('parses an open-ended range to the end of file', () => {
    expect(parseRange('bytes=500-', SIZE)).toEqual({ start: 500, end: 999 });
  });

  it('clamps end to the last byte', () => {
    expect(parseRange('bytes=0-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('parses a suffix range as the final N bytes', () => {
    expect(parseRange('bytes=-500', SIZE)).toEqual({ start: 500, end: 999 });
  });

  it('clamps a suffix range larger than the file to the whole file', () => {
    expect(parseRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('rejects a start at or beyond end of file', () => {
    expect(parseRange('bytes=1000-', SIZE)).toBe('unsatisfiable');
    expect(parseRange('bytes=99999-', SIZE)).toBe('unsatisfiable');
  });

  it('rejects an inverted range', () => {
    expect(parseRange('bytes=500-100', SIZE)).toBe('unsatisfiable');
  });

  it('rejects a zero-length suffix range', () => {
    expect(parseRange('bytes=-0', SIZE)).toBe('unsatisfiable');
  });

  it('rejects any range against an empty file', () => {
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable');
  });
});
