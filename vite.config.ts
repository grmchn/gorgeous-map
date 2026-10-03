/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { RateLimiter, handleResolveRequest } from './server/resolveMapUrl';

/** 開発中も本番と同じ /api/resolve-map-url を使えるようにするミドルウェア。 */
function resolveApiDevPlugin(): Plugin {
  const limiter = new RateLimiter(120);
  const mount: Plugin['configureServer'] = (server) => {
    server.middlewares.use('/api/resolve-map-url', async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const host = req.headers.host ?? 'localhost';
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v);
        }
        const request = new Request(`http://${host}/api/resolve-map-url`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const response = await handleResolveRequest(request, {
          fetch: globalThis.fetch,
          limiter,
          clientKey: req.socket.remoteAddress ?? 'local',
        });
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
    });
  };
  return { name: 'resolve-map-url-dev', configureServer: mount, configurePreviewServer: mount as never };
}

export default defineConfig({
  plugins: [resolveApiDevPlugin()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'] },
});
