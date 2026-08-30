import type { APIRoute } from 'astro';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ready, getItemById, slugToId } from '../../../lib/scanner.js';
import { requestThumbnail, thumbnailPathForId } from '../../../lib/thumbnails.js';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225">
  <rect width="400" height="225" fill="#1f1f1f"/>
  <rect x="175" y="87" width="50" height="50" rx="4" fill="#333"/>
  <path d="M187 112 L213 112 L213 124 L187 124 Z" fill="#555"/>
  <circle cx="200" cy="103" r="8" fill="#555"/>
</svg>`;

export const GET: APIRoute = async ({ params }) => {
  await ready;

  const slug = params.slug || '';
  const item = getItemById(slugToId(slug));

  if (!item) {
    // Fallback: serve a previously cached thumbnail if one exists (e.g. the
    // item vanished from the index mid-rebuild). The cache filename is a
    // digest of the id, so no user input reaches the filesystem path.
    const thumbPath = thumbnailPathForId(slugToId(slug));
    try {
      await stat(thumbPath);
      const stream = createReadStream(thumbPath);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
      });
    } catch { /* fall through */ }
    return servePlaceholder();
  }

  // Generate if not yet available (bounded by the shared thumbnail queue)
  const outPath = await requestThumbnail(item);
  if (!outPath) return servePlaceholder();

  try {
    const fileStat = await stat(outPath);
    const stream   = createReadStream(outPath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type':   'image/jpeg',
        'Content-Length': String(fileStat.size),
        'Cache-Control':  'public, max-age=86400',
      },
    });
  } catch {
    return servePlaceholder();
  }
};

function servePlaceholder(): Response {
  return new Response(PLACEHOLDER_SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
