/**
 * Cloudflare Pages Functions: POST /api/resolve-map-url
 * 本体は server/resolveMapUrl.ts（Vite 開発サーバーと共用）。
 */
import { RateLimiter, handleResolveRequest } from '../../server/resolveMapUrl';

// アイソレート単位のベストエフォート。本番では Cloudflare の Rate Limiting ルールも併用する（README 参照）。
const limiter = new RateLimiter();

export const onRequest = async (context: { request: Request }): Promise<Response> =>
  handleResolveRequest(context.request, { fetch: (input, init) => fetch(input, init), limiter });
