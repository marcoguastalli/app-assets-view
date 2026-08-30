import { describe, it, expect } from 'vitest';
import { formatDuration } from '../../src/lib/metadata.js';

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats hours', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7322)).toBe('2:02:02');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});
