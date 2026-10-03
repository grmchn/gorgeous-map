import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildGoogleLikeStyle, flattenBuildings, installPoiIcons } from './googleStyle';
import workerUrl from './maplibreWorker?worker&url';

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

/**
 * 演出で通るズーム段の周辺タイルを先に取得し、ブラウザのHTTPキャッシュに載せておく。
 * 失敗してもよい（演出自体は親タイルの拡大で続く）。全体で timeoutMs を超えたら打ち切る。
 */
export async function prefetchTiles(
  style: StyleSpecification,
  lng: number,
  lat: number,
  zooms: number[],
  timeoutMs = 2500,
): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const templates: { tiles: string[]; minzoom: number; maxzoom: number }[] = [];
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
      if (tj?.tiles?.length) templates.push({ tiles: tj.tiles, minzoom: tj.minzoom ?? 0, maxzoom: tj.maxzoom ?? 14 });
    }
    const urls = new Set<string>();
    for (const t of templates) {
      for (const zf of zooms) {
        const z = Math.max(t.minzoom, Math.min(t.maxzoom, Math.floor(zf)));
        const n = 2 ** z;
        const { x, y } = lngLatToTile(lng, lat, z);
        const r = zf >= 12 ? 1 : 0.5; // 最終付近は周囲1枚、途中は近い側だけ
        for (let dx = -r; dx <= r; dx += 0.5) {
          for (let dy = -r; dy <= r; dy += 0.5) {
            const tx = (((Math.floor(x + dx) % n) + n) % n) | 0;
            const ty = Math.floor(y + dy);
            if (ty < 0 || ty >= n) continue;
            const tpl = t.tiles[(tx + ty) % t.tiles.length];
            urls.add(tpl.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty)));
          }
        }
      }
    }
    await Promise.allSettled(
      [...urls].map((u) => fetch(u, { signal: ctrl.signal }).then((r) => r.arrayBuffer())),
    );
  } catch {
    /* 先読みは失敗してよい */
  } finally {
    clearTimeout(timer);
  }
}
