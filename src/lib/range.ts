/**
 * Parse an HTTP Range header against a known file size.
 *
 * Returns the byte range to serve (inclusive), 'unsatisfiable' when the
 * request is syntactically valid but outside the file (respond 416), or null
 * when there is no usable single byte-range (serve the full file with 200).
 * Only the first range of a multi-range header is honoured.
 */
export function parseRange(
  header: string | null,
  fileSize: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;

  const match = header.match(/bytes=(\d*)-(\d*)/);
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;

  if (match[1]) {
    start = parseInt(match[1], 10);
    end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
  } else {
    // Suffix range (bytes=-N): the final N bytes of the file
    const suffix = parseInt(match[2], 10);
    start = Math.max(fileSize - suffix, 0);
    end = fileSize - 1;
  }

  if (start >= fileSize || start > end) return 'unsatisfiable';
  return { start, end };
}
