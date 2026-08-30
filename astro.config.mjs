import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: {
    port: parseInt(process.env.PORT || '2000', 10),
    host: true,
  },
  vite: {
    plugins: [
      tailwindcss(),
      // Astro 6 dev mode skips [...slug].astro routing for any URL that ends
      // in a file extension, treating it as a static-asset request. Crucially,
      // this interception happens before the connect middleware stack is even
      // consulted — so enforce:'pre' plugins cannot intercept in time.
      //
      // Fix: prepend a raw Node.js 'request' listener (via prependListener)
      // which fires before Astro's navigation handler. It strips the extension
      // from /media/* URLs and stores the original slug in a header so the
      // page route can do the correct item lookup. This is dev-only;
      // configureServer is a no-op during production builds.
      {
        name: 'media-viewer-file-ext',
        enforce: 'pre',
        configureServer(server) {
          const EXT = /\.[a-z0-9]+$/i;
          return () => {
            server.httpServer?.prependListener('request', (req, _res) => {
              const [pathname, qs] = (req.url ?? '').split('?');
              if (pathname.startsWith('/media/') && EXT.test(pathname)) {
                req.headers['x-media-slug'] = pathname.slice('/media/'.length);
                req.url = pathname.replace(EXT, '') + (qs ? `?${qs}` : '');
              }
            });
          };
        },
      },
    ],
    build: {
      rollupOptions: {
        external: ['sharp', 'chokidar', 'exifr'],
      },
    },
    optimizeDeps: {
      exclude: ['sharp', 'chokidar', 'exifr'],
    },
  },
});
