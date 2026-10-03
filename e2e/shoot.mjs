import { mkdirSync } from 'node:fs';
import { makeStyle } from './make-style.mjs';
import { installOmtMock } from './omt-mock.mjs';
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:5173/';
const lat = Number(process.env.LAT ?? 35.658581), lng = Number(process.env.LNG ?? 139.745433);
const name = process.env.NAME ?? '東京タワー 正面玄関';
const out = process.env.OUT ?? 'shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) }, deviceScaleFactor: 1, ...(process.env.VIDEO ? { recordVideo: { dir: out, size: { width: 390, height: 844 } } } : {}) });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
// MOCK=simple で世界地図＋疑似街路の簡易スタイル、既定は OpenMapTiles 形式の疑似ベクタータイル（Google 風スタイルの確認用）
if (process.env.MOCK === 'simple') {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.request().url().includes('/styles/') ? r.fulfill({ json: makeStyle(lng, lat) }) : r.abort());
} else {
  await installOmtMock(page, { lng, lat });
}
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
const q = new URLSearchParams({ v: '1', lat: String(lat), lng: String(lng), name, z: '17' });
if (process.env.NOTE) q.set('note', process.env.NOTE);
if (process.env.EVENT) q.set('event', process.env.EVENT);
await page.goto(`${BASE}?${q}`);
await page.waitForFunction(() => window.__show, null, { timeout: 30000 });
if (process.env.VIDEO) {
  await page.waitForTimeout(7000);
} else {
  const times = (process.env.TIMES ?? '0,250,500,800,1100,1300,1500,1750,2100,2600,3100,3600,4200,4600,5000,5600,6200').split(',').map(Number);
  for (const t of times) {
    await page.evaluate((t) => window.__show.seek(t), t);
    await page.waitForTimeout(Number(process.env.SETTLE ?? 600));
    await page.evaluate((t) => window.__show.seek(t), t);
    await page.screenshot({ path: `${out}/t${String(t).padStart(5, '0')}.png` });
  }
}
console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'));
await ctx.close();
await browser.close();
