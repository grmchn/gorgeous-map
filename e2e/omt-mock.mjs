/**
 * オフライン検証用：OpenMapTiles スキーマの「それっぽい」ベクタータイルをその場で作って返す。
 * 外部のタイル配信元に出られない環境でも、Google マップ風スタイル（src/map/googleStyle.ts）の
 * 見た目（道路の種類・建物・公園・水・POI・地名）を確認できるようにする。
 *
 *   await installOmtMock(page, { lng, lat });
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const land = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json')));
const landGeo = feature(land, land.objects.land);

const landRings = landGeo.features.flatMap((f) =>
  (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((p) => p[0]),
);
function onLand(x, y) {
  let inside = false;
  for (const ring of landRings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const F = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });
const line = (pts, p) => F({ type: 'LineString', coordinates: pts }, p);
const rect = (x0, y0, x1, y1, p) => F({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] }, p);
const point = (x, y, p) => F({ type: 'Point', coordinates: [x, y] }, p);

/** 目的地のまわりに街を作る */
function makeCity(lng, lat) {
  const L = {
    water: [], waterway: [], landcover: [], landuse: [], park: [], building: [],
    transportation: [], transportation_name: [], poi: [], place: [], boundary: [], water_name: [],
  };
  const rnd = seeded(42);
  const dx = 0.0011; // 約100m
  const dy = 0.0009;
  // 海：陸地にかからない 2 度四方のマスを並べる（球体表示用のざっくりした海）
  const cells = [];
  for (let x = -180; x < 180; x += 2) {
    for (let y = -84; y < 84; y += 2) {
      if (!onLand(x + 1, y + 1)) cells.push([[[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2], [x, y]]]);
    }
  }
  L.water.push(F({ type: 'MultiPolygon', coordinates: cells }, { class: 'ocean' }));
  // 川と池
  L.water.push(rect(lng - 0.02, lat - 0.0105, lng + 0.02, lat - 0.0085, { class: 'river' }));
  L.water_name.push(line([[lng - 0.006, lat - 0.0095], [lng + 0.006, lat - 0.0095]], { name: 'River', 'name:ja': '目黒川' }));
  // 土地利用
  L.landuse.push(rect(lng - 0.02, lat - 0.008, lng + 0.02, lat + 0.012, { class: 'residential' }));
  L.landuse.push(rect(lng - 0.0045, lat - 0.0035, lng + 0.0005, lat + 0.0005, { class: 'commercial' }));
  L.landuse.push(rect(lng + 0.0028, lat + 0.0022, lng + 0.0062, lat + 0.0046, { class: 'hospital' }));
  L.landuse.push(rect(lng - 0.0068, lat + 0.0026, lng - 0.0036, lat + 0.0049, { class: 'school' }));
  L.park.push(rect(lng + 0.0014, lat - 0.0048, lng + 0.0068, lat - 0.0014, { class: 'park' }));
  L.landcover.push(rect(lng + 0.0016, lat - 0.0046, lng + 0.0046, lat - 0.003, { class: 'wood' }));
  L.water.push(rect(lng + 0.005, lat - 0.004, lng + 0.0063, lat - 0.0026, { class: 'lake' }));
  // 道路（格子＋幹線）
  for (let i = -12; i <= 12; i++) {
    const cls = i === 0 ? 'primary' : i % 4 === 0 ? 'secondary' : 'minor';
    L.transportation.push(line([[lng - 0.02, lat + i * dy * 2], [lng + 0.02, lat + i * dy * 2]], { class: cls }));
    L.transportation.push(line([[lng + i * dx * 2, lat - 0.008], [lng + i * dx * 2, lat + 0.012]], { class: i === 3 ? 'trunk' : cls }));
  }
  L.transportation.push(line([[lng - 0.02, lat + 0.0072], [lng + 0.02, lat + 0.0058]], { class: 'motorway' }));
  L.transportation.push(line([[lng - 0.02, lat - 0.0062], [lng + 0.02, lat - 0.0066]], { class: 'rail' }));
  L.transportation.push(line([[lng + 0.0016, lat - 0.0044], [lng + 0.004, lat - 0.002], [lng + 0.0066, lat - 0.0018]], { class: 'path' }));
  for (let i = -6; i <= 6; i++) L.transportation.push(line([[lng + i * dx * 2 + dx, lat - 0.0008], [lng + i * dx * 2 + dx, lat + 0.0008]], { class: 'service' }));
  L.transportation_name.push(line([[lng - 0.01, lat], [lng + 0.01, lat]], { name: 'Main St', 'name:ja': '桜田通り', class: 'primary' }));
  L.transportation_name.push(line([[lng + 3 * dx * 2, lat - 0.008], [lng + 3 * dx * 2, lat + 0.012]], { name: 'Route 1', 'name:ja': '日比谷通り', class: 'trunk' }));
  L.transportation_name.push(line([[lng - 0.02, lat + 0.0072], [lng + 0.02, lat + 0.0058]], { name: 'Expressway', 'name:ja': '首都高速都心環状線', class: 'motorway' }));
  // 建物（街区ごとに数棟、高さはばらばら）
  for (let i = -8; i < 8; i++) {
    for (let j = -4; j < 6; j++) {
      const x0 = lng + i * dx * 2;
      const y0 = lat + j * dy * 2;
      for (let k = 0; k < 4; k++) {
        const bx = x0 + dx * (0.25 + (k % 2) * 0.9);
        const by = y0 + dy * (0.25 + Math.floor(k / 2) * 0.9);
        if (rnd() < 0.15) continue;
        L.building.push(rect(bx, by, bx + dx * (0.55 + rnd() * 0.25), by + dy * (0.55 + rnd() * 0.25), { render_height: Math.round(rnd() ** 2 * 90) }));
      }
    }
  }
  // POI
  const pois = [
    ['cafe', 'スターダストコーヒー'], ['restaurant', 'ラーメン金星'], ['shop', 'ギャラクシー書店'],
    ['hospital', '港中央病院'], ['school', '芝公園小学校'], ['park', '芝公園'], ['museum', '地図博物館'],
    ['lodging', 'ホテル銀河'], ['railway', '芝公園駅'], ['bank', 'みらい銀行'], ['pharmacy', 'ほし薬局'], ['fast_food', 'バーガー惑星'],
  ];
  pois.forEach(([cls, name], i) => {
    const a = (i / pois.length) * Math.PI * 2;
    const r = 0.0012 + (i % 3) * 0.0009;
    L.poi.push(point(lng + Math.cos(a) * r * 1.3, lat + Math.sin(a) * r, { class: cls, name, 'name:ja': name, rank: 1 + i }));
  });
  L.place.push(point(lng - 0.003, lat + 0.003, { class: 'suburb', name: 'Shibakoen', 'name:ja': '芝公園' }));
  L.place.push(point(lng + 0.008, lat - 0.005, { class: 'neighbourhood', name: 'Hamamatsucho', 'name:ja': '浜松町' }));
  L.place.push(point(139.69, 35.69, { class: 'city', name: 'Tokyo', 'name:ja': '東京', rank: 1 }));
  L.place.push(point(138, 37, { class: 'country', name: 'Japan', 'name:ja': '日本' }));
  return L;
}

/** タイル1枚を作る関数と、liberty 相当のスタイルを返す（base はタイル・文字の配信元URL） */
export function makeOmtSource({ lng, lat, base = 'https://tiles.openfreemap.org' }) {
  const layers = makeCity(lng, lat);
  const indexes = Object.fromEntries(
    Object.entries(layers).map(([name, features]) => [
      name,
      new GeoJSONVT({ type: 'FeatureCollection', features }, { maxZoom: 14, indexMaxZoom: 4, tolerance: 2, extent: 4096, buffer: 64 }),
    ]),
  );
  const style = {
    version: 8,
    sources: { openmaptiles: { type: 'vector', tiles: [`${base}/planet/{z}/{x}/{y}.pbf`], maxzoom: 14 } },
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
    layers: [
      { id: 'x', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
      { id: 'y', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-font': ['Noto Sans Regular'] } },
      { id: 'z', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-font': ['Noto Sans Bold'] } },
    ],
  };
  const tile = (z, x, y) => {
    const tiles = {};
    for (const [name, idx] of Object.entries(indexes)) {
      const t = idx.getTile(z, x, y);
      if (t) tiles[name] = t;
    }
    return Buffer.from(fromGeojsonVt(tiles, { version: 2, extent: 4096 }));
  };
  return { style, tile };
}

export async function installOmtMock(page, { lng, lat }) {
  const layers = makeCity(lng, lat);
  const indexes = Object.fromEntries(
    Object.entries(layers).map(([name, features]) => [
      name,
      new GeoJSONVT({ type: 'FeatureCollection', features }, { maxZoom: 14, indexMaxZoom: 4, tolerance: 2, extent: 4096, buffer: 64 }),
    ]),
  );
  const liberty = {
    version: 8,
    sources: { openmaptiles: { type: 'vector', tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'], maxzoom: 14 } },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: [
      { id: 'x', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
      { id: 'y', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-font': ['Noto Sans Regular'] } },
      { id: 'z', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-font': ['Noto Sans Bold'] } },
    ],
  };
  await page.route('https://tiles.openfreemap.org/**', (route) => {
    const url = route.request().url();
    if (url.includes('/styles/')) return route.fulfill({ json: liberty });
    const m = url.match(/\/planet\/(\d+)\/(\d+)\/(\d+)\.pbf/);
    if (!m) return route.abort(); // glyphs など（和文は端末のフォントで描かれる）
    const [z, x, y] = m.slice(1).map(Number);
    const tiles = {};
    for (const [name, idx] of Object.entries(indexes)) {
      const t = idx.getTile(z, x, y);
      if (t) tiles[name] = t;
    }
    const body = Buffer.from(fromGeojsonVt(tiles, { version: 2, extent: 4096 }));
    return route.fulfill({ body, contentType: 'application/x-protobuf' });
  });
}
