import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildGoogleLikeStyle, flattenBuildings, installPoiIcons } from './googleStyle';
import workerUrl from './maplibreWorker?worker&url';
import { startReadiness, type PrefetchGroupSpec } from './prefetchPlan';

maplibregl.setWorkerUrl(workerUrl);

export { installPoiIcons, maplibregl };

/**
 * 地図スタイル（タイル配信元）。既定は OpenFreeMap（キー不要・OpenStreetMap データ）。
 * 本番運用で別の配信元にする場合は VITE_MAP_STYLE_URL を設定する（README 参照）。
 */
export const MAP_STYLE_URL: string =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) || 'https://tiles.openfreemap.org/styles/liberty';

export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** ラベルを日本語優先（name:ja → name）にする。番地やルート番号など name を使わない層は触らない。 */
function preferJapaneseLabels(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers) {
    if (layer.type !== 'symbol' || !layer.layout) continue;
    const tf = layer.layout['text-field'];
    if (tf === undefined) continue;
    const s = JSON.stringify(tf);
    if (!s.includes('name')) continue;
    layer.layout['text-field'] = ['coalesce', ['get', 'name:ja'], ['get', 'name']] as never;
  }
  return style;
}

let stylePromise: Promise<StyleSpecification> | null = null;

/** スタイルJSONを取得して日本語向けに調整する（同じページ内ではキャッシュ）。 */
export function loadStyle(timeoutMs = 10000): Promise<StyleSpecification> {
  stylePromise ??= fetchJson<StyleSpecification>(MAP_STYLE_URL, timeoutMs)
    .then((s) => {
      // 既定は Google マップ風の自前レイヤー（平面・色分け）。配信元の見た目をそのまま使いたいときは
      // VITE_MAP_LOOK=original。OpenMapTiles 以外のスタイルでも元の見た目（建物は平面化）になる。
      const google = import.meta.env.VITE_MAP_LOOK === 'original' ? null : buildGoogleLikeStyle(s);
      const style = google ?? flattenBuildings(preferJapaneseLabels(structuredClone(s)));
      // 球体表示時の大気。寄るにつれて消す。
      style.sky = {
        'sky-color': '#0b1440',
        'horizon-color': '#3a5bd9',
        'fog-color': '#ffffff',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.5,
        'fog-ground-blend': 0.6,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.9, 7, 0],
      };
      return style;
    })
    .catch((e) => {
      stylePromise = null;
      throw e;
    });
  return stylePromise;
}

// ---- タイルの先読み（演出中の白抜けを減らす） ----
// 判定ロジック（startReadiness）は DOM に依存しないので ./prefetchPlan.ts に分けてテストしている。

function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

interface TileJson {
  tiles?: string[];
  maxzoom?: number;
  minzoom?: number;
}

export interface TileTemplate {
  tiles: string[];
  minzoom: number;
  maxzoom: number;
}

/** スタイルのベクター／ラスターソースからタイルURLのテンプレートを得る（TileJSON は取得する） */
export async function resolveTileTemplates(style: StyleSpecification, timeoutMs = 5000): Promise<TileTemplate[]> {
  const out: TileTemplate[] = [];
  for (const src of Object.values(style.sources)) {
    if (src.type !== 'vector' && src.type !== 'raster') continue;
    let tj: TileJson | null = null;
    if ('tiles' in src && src.tiles) tj = { tiles: src.tiles, minzoom: src.minzoom, maxzoom: src.maxzoom };
    else if ('url' in src && src.url) {
      try {
        tj = await fetchJson<TileJson>(src.url, timeoutMs);
      } catch {
        tj = null;
      }
    }
    if (tj?.tiles?.length) out.push({ tiles: tj.tiles, minzoom: tj.minzoom ?? 0, maxzoom: tj.maxzoom ?? 14 });
  }
  return out;
}

/** 地点まわりのタイルURL（radius はタイル単位。0.5 なら地点に近い側の4枚程度、1 なら周囲9枚） */
export function tileUrlsAround(templates: TileTemplate[], lng: number, lat: number, zoom: number, radius: number): string[] {
  const urls = new Set<string>();
  for (const t of templates) {
    const z = Math.max(t.minzoom, Math.min(t.maxzoom, Math.floor(zoom)));
    const n = 2 ** z;
    const { x, y } = lngLatToTile(lng, lat, z);
    for (let dx = -radius; dx <= radius; dx += 0.5) {
      for (let dy = -radius; dy <= radius; dy += 0.5) {
        const tx = (((Math.floor(x + dx) % n) + n) % n) | 0;
        const ty = Math.floor(y + dy);
        if (ty < 0 || ty >= n) continue;
        const tpl = t.tiles[(tx + ty) % t.tiles.length];
        urls.add(tpl.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty)));
      }
    }
  }
  return [...urls];
}

/** 最終画面の文字（英数字の範囲）のグリフ。和文は端末のフォントで描くので不要 */
export function glyphUrls(style: StyleSpecification): string[] {
  if (!style.glyphs) return [];
  const stacks = new Set<string>();
  for (const l of style.layers) {
    if (l.type !== 'symbol') continue;
    const tf = l.layout?.['text-font'];
    if (Array.isArray(tf) && tf.every((x) => typeof x === 'string')) stacks.add((tf as string[]).join(','));
  }
  return [...stacks].map((s) => style.glyphs!.replace('{fontstack}', encodeURIComponent(s)).replace('{range}', '0-255'));
}

/**
 * 演出の前半（「そぉ～れ」→ 地球が回る →「ここぉ！」）は時間が決まっていて、その間は地球しか映らない。
 * そこで、後で必要になるタイル（ズーム各段・最終画面）は演出を始めてから裏で読み込み、
 * 「必要になる時刻までに読み終わる見込み」が立った時点で演出を始める（＝待ち時間を短くする）。
 * 取得したものはブラウザの HTTP キャッシュに載り、地図はそこから読み込む。
 */
export class TilePrefetcher {
  private queue: string[] = [];
  private done = 0;
  private startedAt = 0;
  private active = 0;
  private stopped = false;
  readonly total: number;

  constructor(
    private groups: { urls: string[]; needAtMs: number }[],
    private concurrency = 6,
  ) {
    // 必要になる順に取得する（重複は先の方だけ）
    const seen = new Set<string>();
    for (const g of groups) {
      g.urls = g.urls.filter((u) => !seen.has(u) && seen.add(u));
      this.queue.push(...g.urls);
    }
    this.total = this.queue.length;
  }

  start(): void {
    this.startedAt = performance.now();
    for (let i = 0; i < this.concurrency; i++) this.next();
  }

  /** 同時取得数を変える（地球の初期表示の読み込みと取り合わないよう、最初は少なめにする） */
  setConcurrency(n: number): void {
    this.concurrency = n;
    for (let i = this.active; i < n; i++) this.next();
  }

  stop(): void {
    this.stopped = true;
  }

  get finished(): boolean {
    return this.done >= this.total;
  }

  /** 今すぐ演出を始めてよいか（と進み具合 0..1） */
  status(margin = 0.6): { ready: boolean; fraction: number } {
    const spec: PrefetchGroupSpec[] = this.groups.map((g) => ({ count: g.urls.length, needAtMs: g.needAtMs }));
    return startReadiness(spec, this.done, performance.now() - this.startedAt, margin);
  }

  private next(): void {
    if (this.stopped || this.active >= this.concurrency) return;
    const url = this.queue.shift();
    if (!url) return;
    this.active++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(url, { signal: ctrl.signal })
      .then((r) => r.arrayBuffer())
      .catch(() => undefined) // 失敗しても止めない（地図は親タイルの拡大で続く）
      .finally(() => {
        clearTimeout(timer);
        this.active--;
        this.done++;
        this.next();
      });
  }
}
