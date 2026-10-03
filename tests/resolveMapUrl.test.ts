import { describe, expect, it, vi } from 'vitest';
import { RateLimiter, handleResolveRequest, isFetchAllowed, resolveMapUrl } from '../server/resolveMapUrl';

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function fakeFetch(map: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.redirect).toBe('manual');
    const key = String(input);
    const h = map[key];
    if (!h) throw new Error(`unexpected fetch: ${key}`);
    return h();
  });
}

describe('短縮URLの展開', () => {
  it('施設URLへ展開できれば resolved', async () => {
    const f = fakeFetch({
      'https://maps.app.goo.gl/abc': () =>
        redirect('https://www.google.com/maps/place/Cafe+X/@1,2,17z/data=!8m2!3d1.5!4d2.5?g_st=ic'),
    });
    const r = await resolveMapUrl('https://maps.app.goo.gl/abc', { fetch: f });
    expect(r).toMatchObject({ status: 'resolved', lat: 1.5, lng: 2.5, name: 'Cafe X', coordinateKind: 'place', source: 'short' });
    // 展開先の長いURLは取得しない
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('展開できても座標が無ければ partial（名前のみ）', async () => {
    const f = fakeFetch({
      'https://maps.app.goo.gl/abc': () =>
        redirect('https://www.google.com/maps/place/Cafe+X/data=!4m2!3m1!1s0x1:0x2'),
    });
    const r = await resolveMapUrl('https://maps.app.goo.gl/abc', { fetch: f });
    expect(r).toMatchObject({ status: 'partial', lat: null, name: 'Cafe X' });
  });

  it('短縮→短縮→長いURL の多段リダイレクト', async () => {
    const f = fakeFetch({
      'https://goo.gl/maps/xyz': () => redirect('https://maps.app.goo.gl/abc', 301),
      'https://maps.app.goo.gl/abc': () => redirect('https://maps.google.com/?q=-1.25,-2.5'),
    });
    const r = await resolveMapUrl('https://goo.gl/maps/xyz', { fetch: f });
    expect(r).toMatchObject({ status: 'resolved', lat: -1.25, lng: -2.5 });
  });

  it('consent.google.com に飛ばされても continue を解析', async () => {
    const f = fakeFetch({
      'https://maps.app.goo.gl/abc': () =>
        redirect(
          'https://consent.google.com/m?continue=' +
            encodeURIComponent('https://www.google.com/maps/place/Y/data=!8m2!3d3!4d4'),
        ),
    });
    const r = await resolveMapUrl('https://maps.app.goo.gl/abc', { fetch: f });
    expect(r).toMatchObject({ status: 'resolved', lat: 3, lng: 4 });
  });

  it('Googleマップ以外へのリダイレクトは追わない', async () => {
    for (const loc of [
      'https://evil.example.com/',
      'http://127.0.0.1/admin',
      'http://169.254.169.254/latest/meta-data',
      'http://maps.app.goo.gl/abc2',
      'https://user:pw@maps.app.goo.gl/abc2',
      'https://maps.app.goo.gl:8443/abc2',
    ]) {
      const f = fakeFetch({ 'https://maps.app.goo.gl/abc': () => redirect(loc) });
      const r = await resolveMapUrl('https://maps.app.goo.gl/abc', { fetch: f });
      expect(r.status).toBe('unsupported');
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('最大リダイレクト回数で打ち切る', async () => {
    let n = 0;
    const f = vi.fn(async () => redirect(`https://maps.app.goo.gl/loop${++n}`));
    const r = await resolveMapUrl('https://maps.app.goo.gl/start', { fetch: f, maxRedirects: 3 });
    expect(r.status).toBe('unsupported');
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('タイムアウト', async () => {
    const f = vi.fn(
      (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    const r = await resolveMapUrl('https://maps.app.goo.gl/slow', { fetch: f, timeoutMs: 20 });
    expect(r.status).toBe('unsupported');
    expect(r.message).toContain('時間切れ');
  });

  it('404 は無効なリンク', async () => {
    const f = fakeFetch({ 'https://maps.app.goo.gl/gone': () => new Response('nope', { status: 404 }) });
    const r = await resolveMapUrl('https://maps.app.goo.gl/gone', { fetch: f });
    expect(r.status).toBe('unsupported');
  });

  it('200 で本文が返っても本文は読まず展開失敗扱い（HTMLスクレイピングしない）', async () => {
    const f = fakeFetch({ 'https://maps.app.goo.gl/x': () => new Response('<html>35.1,135.2</html>') });
    const r = await resolveMapUrl('https://maps.app.goo.gl/x', { fetch: f });
    expect(r).toMatchObject({ status: 'unsupported', lat: null });
  });

  it('長いURLはネットワークを使わずに解析', async () => {
    const f = vi.fn();
    const r = await resolveMapUrl('https://maps.google.com/?q=1,2', { fetch: f as never });
    expect(r).toMatchObject({ status: 'resolved', source: 'long' });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com/',
    'http://localhost:8787/',
    'http://127.0.0.1/',
    'https://10.0.0.1/maps/',
    'http://maps.app.goo.gl/abc',
    'https://goo.gl/xyz',
    'file:///etc/passwd',
    'not a url',
  ])('許可リスト外 %s は取得しない', async (u) => {
    const f = vi.fn();
    const r = await resolveMapUrl(u, { fetch: f as never });
    expect(r.status).toBe('unsupported');
    expect(f).not.toHaveBeenCalled();
  });

  it('isFetchAllowed', () => {
    expect(isFetchAllowed(new URL('https://maps.app.goo.gl/a'))).toBe(true);
    expect(isFetchAllowed(new URL('https://maps.app.goo.gl/'))).toBe(false);
    expect(isFetchAllowed(new URL('https://www.google.com/maps/place/x'))).toBe(false);
  });
});

describe('HTTPハンドラ', () => {
  const ok = () => vi.fn(async () => redirect('https://maps.google.com/?q=1,2'));
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://app.example/api/resolve-map-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });

  it('正常系', async () => {
    const res = await handleResolveRequest(post(JSON.stringify({ url: 'https://maps.app.goo.gl/a' })), {
      fetch: ok(),
      limiter: new RateLimiter(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'resolved', lat: 1, lng: 2 });
  });

  it('GET は 405', async () => {
    const res = await handleResolveRequest(new Request('https://app.example/api/resolve-map-url'), {
      fetch: ok(),
      limiter: new RateLimiter(),
    });
    expect(res.status).toBe(405);
  });

  it('別オリジンからは 403', async () => {
    const res = await handleResolveRequest(
      post(JSON.stringify({ url: 'https://maps.app.goo.gl/a' }), { origin: 'https://evil.example' }),
      { fetch: ok(), limiter: new RateLimiter() },
    );
    expect(res.status).toBe(403);
  });

  it('大きすぎる本文は 413', async () => {
    const res = await handleResolveRequest(post(JSON.stringify({ url: 'x'.repeat(5000) })), {
      fetch: ok(),
      limiter: new RateLimiter(),
    });
    expect(res.status).toBe(413);
  });

  it('壊れたJSONは 400', async () => {
    const res = await handleResolveRequest(post('{'), { fetch: ok(), limiter: new RateLimiter() });
    expect(res.status).toBe(400);
  });

  it('レート制限で 429', async () => {
    const limiter = new RateLimiter(2);
    const f = ok();
    const mk = () => post(JSON.stringify({ url: 'https://maps.app.goo.gl/a' }), { 'cf-connecting-ip': '1.2.3.4' });
    expect((await handleResolveRequest(mk(), { fetch: f, limiter })).status).toBe(200);
    expect((await handleResolveRequest(mk(), { fetch: f, limiter })).status).toBe(200);
    expect((await handleResolveRequest(mk(), { fetch: f, limiter })).status).toBe(429);
  });
});
