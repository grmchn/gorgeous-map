/**
 * 短縮URL（maps.app.goo.gl 等）の展開API。
 *
 * 任意URLへのプロキシにならないよう、次を守る:
 * - 取得するのは許可リストの短縮URLホストだけ（HTTPS・既定ポート・認証情報なし）。
 * - リダイレクトは自動追従せず、1ホップごとに転送先を検証する。
 * - 展開先が長い地図URLになった時点で取得をやめ、URL文字列だけを解析する（HTMLは読まない）。
 * - 本文は読まずに破棄する（＝取得サイズは常に0バイト）。
 * - タイムアウト・最大リダイレクト回数・リクエストサイズ・レート制限を設ける。
 */
import {
  MESSAGES,
  isLongMapsUrl,
  isShortMapsUrl,
  parseLongMapsUrl,
  unsupported,
  unwrapConsentUrl,
  type MapUrlResult,
} from '../src/lib/googleMaps';

export interface ResolveOptions {
  fetch: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
}

export const LIMITS = {
  timeoutMs: 5000,
  maxRedirects: 5,
  maxUrlLength: 2048,
  maxBodyBytes: 4096,
  rateLimitPerMinute: 20,
} as const;

/** fetch してよいURLか（許可リストの短縮URLホストのみ）。 */
export function isFetchAllowed(u: URL): boolean {
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port !== '' && u.port !== '443') return false;
  return isShortMapsUrl(u);
}

export async function resolveMapUrl(input: string, opts: ResolveOptions): Promise<MapUrlResult> {
  if (input.length > LIMITS.maxUrlLength) return unsupported('URLが長すぎます。');
  let current: URL;
  try {
    current = new URL(input.trim());
  } catch {
    return unsupported(MESSAGES.notUrl);
  }

  // 長いURLは取得せずにそのまま解析する
  if (isLongMapsUrl(current)) return { ...parseLongMapsUrl(current), source: 'long' };
  if (!isFetchAllowed(current)) return unsupported(MESSAGES.notMaps);

  const maxRedirects = opts.maxRedirects ?? LIMITS.maxRedirects;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? LIMITS.timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!isFetchAllowed(current)) return unsupported(MESSAGES.notMaps);
      let res: Response;
      try {
        res = await opts.fetch(current.href, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; GorgeousMap/1.0)' },
        });
      } catch {
        return unsupported(
          controller.signal.aborted ? `${MESSAGES.shortUnresolved}（時間切れ）` : MESSAGES.shortUnresolved,
        );
      }
      // 本文は使わない。読まずに捨てる。
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return unsupported(MESSAGES.shortUnresolved);
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          return unsupported(MESSAGES.shortUnresolved);
        }
        next = unwrapConsentUrl(next) ?? next;
        if (isLongMapsUrl(next)) return { ...parseLongMapsUrl(next), source: 'short' };
        if (isFetchAllowed(next)) {
          current = next;
          continue;
        }
        return unsupported('短縮URLの展開先がGoogleマップではありませんでした。');
      }
      if (res.status === 404 || res.status === 410) {
        return unsupported('短縮URLが見つかりませんでした。リンクが無効になっている可能性があります。');
      }
      return unsupported(MESSAGES.shortUnresolved);
    }
    return unsupported(`${MESSAGES.shortUnresolved}（転送回数が多すぎます）`);
  } finally {
    clearTimeout(timer);
  }
}

/** 1分あたりの回数で制限する簡易レートリミッタ（インスタンス内のベストエフォート）。 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number = LIMITS.rateLimitPerMinute,
    private windowMs = 60_000,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
    }
    return true;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** POST /api/resolve-map-url の共通ハンドラ（Cloudflare Pages Functions と Vite 開発サーバーで共用）。 */
export async function handleResolveRequest(
  request: Request,
  deps: { fetch: typeof fetch; limiter: RateLimiter; clientKey?: string },
): Promise<Response> {
  if (request.method !== 'POST') return json(unsupported('POST で呼び出してください。'), 405);

  const origin = request.headers.get('origin');
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === new URL(request.url).host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return json(unsupported('このAPIは同じサイトからのみ利用できます。'), 403);
  }

  const key =
    deps.clientKey ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  if (!deps.limiter.allow(key)) {
    return json(unsupported('リクエストが多すぎます。少し待ってから再度お試しください。'), 429);
  }

  const lenHeader = Number(request.headers.get('content-length') ?? '0');
  if (lenHeader > LIMITS.maxBodyBytes) return json(unsupported('リクエストが大きすぎます。'), 413);
  const text = await request.text();
  if (text.length > LIMITS.maxBodyBytes) return json(unsupported('リクエストが大きすぎます。'), 413);

  let url: unknown;
  try {
    url = (JSON.parse(text) as { url?: unknown })?.url;
  } catch {
    return json(unsupported('リクエストの形式が正しくありません。'), 400);
  }
  if (typeof url !== 'string' || !url) return json(unsupported(MESSAGES.notUrl), 400);

  const result = await resolveMapUrl(url, { fetch: deps.fetch });
  return json(result, 200);
}
