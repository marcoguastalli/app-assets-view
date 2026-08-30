import type { APIRoute } from 'astro';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { lookup } from 'mime-types';
import { ready, getItemById, slugToId } from '../../../lib/scanner.js';
import { MEDIA_DIR, safePath } from '../../../lib/paths.js';
import { parseRange } from '../../../lib/range.js';

export const GET: APIRoute = async ({ params, request }) => {
  await ready;

  // Serve only indexed media items. This keeps everything else under
  // MEDIA_DIR unreachable: non-media files (dotfiles, notes, configs) and
  // symlinks, which the scanner skips but createReadStream would follow —
  // a symlink inside MEDIA_DIR pointing outside it would otherwise pass
  // safePath and leak arbitrary files.
  const item = getItemById(slugToId(params.slug || ''));
  if (!item) {
    return new Response('Not Found', { status: 404 });
  }

  const filePath = safePath(MEDIA_DIR, item.path);
  if (!filePath) {
    return new Response('Forbidden', { status: 403 });
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(filePath);
  } catch {
    return new Response('Not Found', { status: 404 });
  }

  if (!fileStat.isFile()) {
    return new Response('Not Found', { status: 404 });
  }

  const mimeType = lookup(filePath) || 'application/octet-stream';
  const fileSize = fileStat.size;

  // Handle range requests (needed for video seeking)
  const range = parseRange(request.headers.get('range'), fileSize);
  if (range === 'unsatisfiable') {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    });
  }
  if (range) {
    const { start, end } = range;
    const stream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type':  mimeType,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type':   mimeType,
      'Content-Length': String(fileSize),
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'public, max-age=3600',
    },
  });
};
