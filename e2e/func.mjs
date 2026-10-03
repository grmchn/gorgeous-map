import { makeStyle } from './make-style.mjs';
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:5173/';
const OUT = process.env.OUT; // スクリーンショットの保存先（任意）
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://tiles.openfreemap.org/**', (r) => r.request().url().includes('/styles/') ? r.fulfill({ json: makeStyle(139.745433, 35.658581) }) : r.abort());
  return { ctx, page };
}
const placeUrl = (extra = '') => `${BASE}?v=1&lat=35.658581&lng=139.745433&name=${encodeURIComponent('東京タワー&#🍣 <b>x</b>')}&event=${encodeURIComponent('佐藤さん送別会 & 二次会')}&note=${encodeURIComponent('北側入口')}&z=17${extra}`;
const phase = (page) => page.evaluate(() => document.querySelector('.viewer')?.dataset.phase);

const browser = await chromium.launch({ args: GL });

// 1. 実時間の通し再生：フェーズ遷移とフレーム数
{
  const { ctx, page } = await newPage(browser);
  await page.goto(placeUrl());
  await page.waitForFunction(() => document.querySelector('.viewer')?.dataset.phase !== 'loading', null, { timeout: 30000 });
  const titleAtStart = await page.isVisible('.event-title');
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const phases = []; let frames = 0; const lngs = new Set(); const t0 = performance.now(); let maxGap = 0; let last = t0;
    const loop = () => {
      const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; frames++;
      const p = document.querySelector('.viewer').dataset.phase;
      if (p === 'globe' && window.__show) lngs.add(Math.round(window.__show['map'].getCenter().lng / 30));
      if (phases.at(-1)?.p !== p) phases.push({ p, t: Math.round(now - t0) });
      if (p === 'settled') return resolve({ phases, frames, ms: Math.round(now - t0), maxGap: Math.round(maxGap), spun: lngs.size >= 6 });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }));
  check('通し再生が settled まで到達', seen.phases.at(-1).p === 'settled', JSON.stringify(seen));
  const name = await page.textContent('.place-name');
  check('名前をテキストとして表示（HTML解釈しない）', name === '東京タワー&#🍣 <b>x</b>', name);
  check('補足表示', (await page.textContent('.place-note')) === '北側入口');
  check('イベント名を上部タイトルに表示', (await page.textContent('.event-title h1')) === '佐藤さん送別会 & 二次会');
  const titleBottom = await page.evaluate(() => document.querySelector('.event-title').getBoundingClientRect().bottom);
  const pinTop = await page.evaluate(() => document.querySelector('.pin').getBoundingClientRect().top);
  check('タイトルがピンを隠さない', pinTop > titleBottom, JSON.stringify({ titleBottom, pinTop }));
  check('globe 中に地球が回る（経度が変化）', seen.spun, '');
  check('タイトルは演出の最初から表示', titleAtStart);
  const skipHidden = await page.isHidden('.skip');
  check('settled 後にスキップが消える', skipHidden);
  const gm = await page.getAttribute('a[href*="google.com/maps"]', 'href');
  check('Googleマップリンクが座標', gm === 'https://www.google.com/maps/search/?api=1&query=35.658581%2C139.745433', gm);
  const dragOn = await page.evaluate(() => window.__show && !document.querySelector('.actions').hasAttribute('inert'));
  check('操作UIが有効', dragOn);
  // 共有：Web Share 非対応 → クリップボード
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => { delete navigator.share; });
  await page.click('text=URLコピー');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('URLコピー：既知パラメータのみ・往復OK', clip.startsWith(BASE + '?v=1&lat=35.658581&lng=139.745433&name=') && clip.includes('&event=') && !clip.includes('dbg'), clip);
  // 共有キャンセルはエラーにならない
  await page.evaluate(() => { navigator.share = () => Promise.reject(new DOMException('cancel', 'AbortError')); });
  await page.click('text=共有する');
  await page.waitForTimeout(300);
  check('共有キャンセルでエラー表示しない', !(await page.isVisible('.manual-copy')));
  // コピー不能 → 手動コピー欄
  await page.evaluate(() => { delete navigator.share; Object.defineProperty(navigator, 'clipboard', { value: undefined }); document.execCommand = () => false; });
  await page.click('text=URLコピー');
  check('コピー不能時はURL欄を表示', await page.isVisible('.manual-copy input'));
  await page.click('.manual-copy >> text=閉じる');
  check('JSエラーなし(1)', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// 2. スキップ・再生連打・回転
{
  const { ctx, page } = await newPage(browser);
  await page.goto(placeUrl());
  await page.waitForFunction(() => document.querySelector('.viewer')?.dataset.phase === 'pointing', null, { timeout: 30000 });
  await page.click('.skip');
  await page.waitForTimeout(100);
  check('スキップで即 settled', (await phase(page)) === 'settled');
  const cam = await page.evaluate(() => { const m = document.querySelector('.maplibregl-map'); return null; });
  for (let i = 0; i < 6; i++) { await page.click('text=もう一度'); await page.waitForTimeout(80 + i * 40); if (i < 5) { const p = await phase(page); if (p === 'settled') break; } }
  // 回転（サイズ変更）
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.viewer')?.dataset.phase === 'settled', null, { timeout: 15000 });
  const pin = await page.evaluate(() => { const r = document.querySelector('.pin').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.bottom }; });
  const card = await page.evaluate(() => document.querySelector('.name-card').getBoundingClientRect().top);
  check('再生連打・回転後もピンが画面内でカードより上', pin.x > 0 && pin.x < 390 && pin.y > 0 && pin.y < card, JSON.stringify({ pin, card }));
  if (OUT) await page.screenshot({ path: `${OUT}/after-replay.png` });
  // 縦横回転中の再生
  await page.click('text=もう一度');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.querySelector('.viewer')?.dataset.phase === 'settled', null, { timeout: 15000 });
  if (OUT) await page.screenshot({ path: `${OUT}/landscape.png` });
  check('JSエラーなし(2)', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// 3. 軽減モーション
{
  const { ctx, page } = await newPage(browser, { reducedMotion: 'reduce' });
  await page.goto(placeUrl());
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelector('.viewer')?.dataset.phase === 'settled', null, { timeout: 30000 });
  const lines = await page.evaluate(() => { const c = document.querySelector('.speedlines'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return n; });
  check('軽減モーション：集中線なしで結果へ', lines === 0);
  if (OUT) await page.screenshot({ path: `${OUT}/reduced.png` });
  await ctx.close();
}

// 4. 不正URL
for (const [label, q] of [['lat欠落', '?lng=1&name=x'], ['未対応v', '?v=9&lat=1&lng=1&name=x'], ['極域', '?lat=89.9&lng=1&name=x'], ['重複', '?lat=1&lat=2&lng=1&name=x']]) {
  const { ctx, page } = await newPage(browser);
  await page.goto(BASE + q);
  const ok = await page.isVisible('.error-page');
  const txt = await page.textContent('.error-list');
  check(`不正URL(${label})はエラー画面`, ok && !(await page.isVisible('.viewer')), txt);
  if (OUT && label === '極域') await page.screenshot({ path: `${OUT}/error.png` });
  await ctx.close();
}

// 5. WebGL 非対応
{
  const b2 = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
  const { ctx, page } = await newPage(b2);
  await page.goto(placeUrl());
  await page.waitForSelector('.viewer.fallback', { timeout: 15000 });
  check('WebGL非対応：場所名・座標・Googleマップリンク', (await page.isVisible('.place-name')) && (await page.textContent('.fallback-coords')).includes('35.658581') && (await page.isVisible('a[href*="google.com/maps"]')));
  if (OUT) await page.screenshot({ path: `${OUT}/nowebgl.png` });
  await ctx.close();
  await b2.close();
}

// 6. 地図スタイル取得失敗
{
  const { ctx, page } = await newPage(browser);
  await page.unroute('https://tiles.openfreemap.org/**');
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.goto(placeUrl());
  await page.waitForSelector('.viewer.fallback', { timeout: 20000 });
  check('地図通信失敗：結果表示へ到達', await page.isVisible('text=共有する'));
  await ctx.close();
}

// 7. 入力画面：長いURL取り込み → ピン → 共有URL
{
  const { ctx, page } = await newPage(browser);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(BASE);
  await page.waitForSelector('.editor-map .maplibregl-canvas', { timeout: 30000 });
  await page.click('text=共有URLを作る');
  check('未入力では作成できない', await page.isVisible('.form-errors'), await page.textContent('.form-errors'));
  await page.fill('#gm-url', '東京タワー\nhttps://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E3%82%BF%E3%83%AF%E3%83%BC/@35.6585805,139.7428578,17z/data=!3m1!4b1!4m6!3m5!1s0x60188bbd9009ec09:0x481a93f0d2a409dd!8m2!3d35.6585805!4d139.7454329!16z?entry=ttu');
  await page.click('text=読み込む');
  await page.waitForSelector('.import-result[data-tone="ok"]');
  check('長いURL：名前と施設座標', (await page.inputValue('#place-name')) === '東京タワー' && (await page.textContent('.coord-text')) === '35.658580, 139.745433', await page.textContent('.coord-text'));
  await page.waitForTimeout(1200);
  if (OUT) await page.screenshot({ path: `${OUT}/editor-imported.png`, fullPage: true });
  // 地図クリックでピン移動
  const box = await page.locator('.editor-map').boundingBox();
  await page.locator('.editor-map canvas').click({ position: { x: box.width / 2 + 60, y: box.height / 2 + 40 } });
  const moved = await page.textContent('.coord-text');
  check('地図クリックでピン修正', moved !== '35.658580, 139.745433' && (await page.textContent('.coord-kind')).includes('地図で指定'), moved);
  await page.fill('#place-name', '東京タワー 北口 & #1 🗼');
  await page.fill('#place-event', '夏祭り 2026');
  await page.click('text=共有URLを作る');
  const url = await page.inputValue('.result input');
  const u = new URL(url);
  const [la, ln] = moved.split(', ').map(Number);
  check('共有URLが修正後の座標・名前', Number(u.searchParams.get('lat')) === la && Number(u.searchParams.get('lng')) === ln && u.searchParams.get('name') === '東京タワー 北口 & #1 🗼' && u.searchParams.get('event') === '夏祭り 2026', url);
  // 表示中心だけのURL
  await page.fill('#gm-url', 'https://www.google.com/maps/@35.6812,139.7671,15z');
  await page.click('text=読み込む');
  await page.waitForSelector('.import-result[data-tone="warn"]');
  check('表示中心のみ：警告と区別', (await page.textContent('.import-result')).includes('表示中心'));
  check('取り込み後は古い共有URLを隠す', await page.isHidden('.result'));
  // 短縮URL（このサンドボックスでは外部に出られないので展開失敗の経路）
  await page.fill('#gm-url', 'https://maps.app.goo.gl/AbCdEf123');
  await page.click('text=読み込む');
  await page.waitForSelector('.import-result[data-tone="error"]', { timeout: 15000 });
  const t = await page.textContent('.import-result');
  check('短縮URL：展開失敗でも入力が残る', t.includes('短縮URL') && (await page.inputValue('#place-name')).includes('東京タワー'), t);
  // 経路URL
  await page.fill('#gm-url', 'https://www.google.com/maps/dir/35.1,135.1/35.2,135.2');
  await page.click('text=読み込む');
  check('経路URL：非対応案内', (await page.textContent('.import-result')).includes('経路'));
  // 座標の直接入力（南緯西経）
  await page.click('text=緯度・経度を直接入力');
  await page.fill('input[aria-label="緯度, 経度"]', '-22.951916, -43.210487');
  await page.click('text=反映');
  check('座標直接入力', (await page.textContent('.coord-text')) === '-22.951916, -43.210487');
  // プレビュー
  await page.click('text=演出をプレビュー');
  await page.waitForSelector('.preview-overlay .viewer');
  await page.waitForFunction(() => document.querySelector('.preview-overlay .viewer')?.dataset.phase !== 'loading', null, { timeout: 20000 });
  await page.click('.preview-overlay .skip');
  await page.click('text=編集に戻る');
  check('プレビューを閉じると入力が残る', (await page.isHidden('.preview-overlay')) && (await page.inputValue('#place-name')) === '東京タワー 北口 & #1 🗼');
  check('JSエラーなし(7)', page.errors.filter((e) => !e.includes('Failed to load resource')).length === 0, page.errors.join(' | '));
  if (OUT) await page.screenshot({ path: `${OUT}/editor-end.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(results.join('\n'));
