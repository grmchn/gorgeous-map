import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature, mesh } from 'topojson-client';
// 外部タイルに出られない環境でも演出を検証するための、オフライン用の簡易地図スタイル。
const require = createRequire(import.meta.url);
const land = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json')));
const countries = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json')));
const landGeo = feature(land, land.objects.land);
const borders = mesh(countries, countries.objects.countries, (a, b) => a !== b);
export function makeStyle(lng, lat) {
  // 目的地周辺に疑似的な街路と建物を置く（オフライン検証用）
  const roads = [], blds = [];
  const step = 0.0012;
  for (let i = -12; i <= 12; i++) {
    roads.push({ type: 'Feature', properties: { major: i % 4 === 0 }, geometry: { type: 'LineString', coordinates: [[lng - 0.015, lat + i * step], [lng + 0.015, lat + i * step]] } });
    roads.push({ type: 'Feature', properties: { major: i % 4 === 0 }, geometry: { type: 'LineString', coordinates: [[lng + i * step * 1.2, lat - 0.015], [lng + i * step * 1.2, lat + 0.015]] } });
  }
  for (let i = -11; i < 11; i++) for (let j = -11; j < 11; j++) {
    const x = lng + i * step * 1.2 + 0.0002, y = lat + j * step + 0.0002, w = step * 1.2 - 0.0004, h = step - 0.0004;
    blds.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] } });
  }
  return {
    version: 8,
    sources: {
      land: { type: 'geojson', data: landGeo },
      borders: { type: 'geojson', data: borders },
      roads: { type: 'geojson', data: { type: 'FeatureCollection', features: roads } },
      blds: { type: 'geojson', data: { type: 'FeatureCollection', features: blds } },
    },
    layers: [
      { id: 'water', type: 'background', paint: { 'background-color': '#8fc1ec' } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#eeeadf' } },
      { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#9c8fb0', 'line-width': 1 } },
      { id: 'blds', type: 'fill', source: 'blds', minzoom: 13, paint: { 'fill-color': '#d9d0c9', 'fill-outline-color': '#bfb3aa' } },
      { id: 'roads', type: 'line', source: 'roads', minzoom: 11, paint: { 'line-color': '#fff', 'line-width': ['case', ['get', 'major'], 9, 4] } },
    ],
  };
}
