import type { APIRoute } from 'astro';
import { ready, getMediaIndex } from '../../lib/scanner.js';
import { buildSearchIndex } from '../../lib/search.js';

export const GET: APIRoute = async () => {
  await ready;
  const { allItems } = getMediaIndex();
  const index = buildSearchIndex(allItems);
  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
