import { describe, it, expect } from 'vitest';
import { getMediaType, makeId, idToRelativePath, slugToId } from '../../src/lib/scanner.js';

describe('getMediaType', () => {
  it('identifies image extensions', () => {
    expect(getMediaType('photo.jpg')).toBe('image');
    expect(getMediaType('photo.JPEG')).toBe('image');
    expect(getMediaType('photo.png')).toBe('image');
    expect(getMediaType('photo.webp')).toBe('image');
    expect(getMediaType('photo.gif')).toBe('image');
  });

  it('identifies video extensions', () => {
    expect(getMediaType('clip.mp4')).toBe('video');
    expect(getMediaType('clip.mkv')).toBe('video');
    expect(getMediaType('clip.avi')).toBe('video');
    expect(getMediaType('clip.MOV')).toBe('video');
    expect(getMediaType('clip.webm')).toBe('video');
  });

  it('identifies pdf extension', () => {
    expect(getMediaType('doc.pdf')).toBe('pdf');
    expect(getMediaType('doc.PDF')).toBe('pdf');
  });

  it('identifies text extensions', () => {
    expect(getMediaType('notes.txt')).toBe('text');
    expect(getMediaType('README.md')).toBe('text');
    expect(getMediaType('data.JSON')).toBe('text');
    expect(getMediaType('app.log')).toBe('text');
    expect(getMediaType('data.csv')).toBe('text');
    expect(getMediaType('config.yaml')).toBe('text');
    expect(getMediaType('config.yml')).toBe('text');
  });

  it('returns null for unknown extensions', () => {
    expect(getMediaType('file.exe')).toBeNull();
    expect(getMediaType('file')).toBeNull();
  });
});

describe('makeId / idToRelativePath', () => {
  it('round-trips simple paths', () => {
    const rel = 'Photography/photo1.jpg';
    const id  = makeId(rel);
    expect(idToRelativePath(id)).toBe(rel);
  });

  it('handles paths with spaces', () => {
    const rel = 'Italy 2024/my photo.jpg';
    const id  = makeId(rel);
    expect(id).toContain('Italy%202024');
    expect(idToRelativePath(id)).toBe(rel);
  });

  it('handles deeply nested paths', () => {
    const rel = 'A/B/C/deep.mp4';
    const id  = makeId(rel);
    expect(idToRelativePath(id)).toBe(rel);
  });
});

describe('slugToId', () => {
  it('normalizes an already-decoded slug (API route form)', () => {
    // API routes receive decoded params — slugToId must re-encode to match the stored ID
    expect(slugToId('Summer 2024/photo.jpg')).toBe('Summer%202024/photo.jpg');
  });

  it('normalizes a URL-encoded slug (page route form)', () => {
    // Page routes receive encoded params — decode-then-encode must be idempotent
    expect(slugToId('Summer%202024/photo.jpg')).toBe('Summer%202024/photo.jpg');
  });

  it('round-trips simple ASCII paths unchanged', () => {
    expect(slugToId('Photography/img.jpg')).toBe('Photography/img.jpg');
  });

  it('handles multi-level nesting with spaces', () => {
    expect(slugToId('My%20Videos/Action%20Movies/clip.mp4')).toBe('My%20Videos/Action%20Movies/clip.mp4');
  });
});
