import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { buildGoogleLikeStyle, flattenBuildings } from '../src/map/googleStyle';

/** OpenFreeMap liberty 相当の最小構成（ソース・glyphs・フォント名の借用だけ確認できればよい） */
const liberty = (): StyleSpecification => ({
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' } },
  glyphs: 'https://tiles.example/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14 },
    { id: 'label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-font': ['Noto Sans Regular'] } },
    { id: 'label-b', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-font': ['Noto Sans Bold'] } },
  ],
});

describe('Google マップ風スタイル', () => {
  it('スタイル仕様として正しい', () => {
    const s = buildGoogleLikeStyle(liberty())!;
    expect(s).not.toBeNull();
    expect(validateStyleMin(s)).toEqual([]);
  });

  it('元スタイルのソース・glyphs・フォントを借りる', () => {
    const s = buildGoogleLikeStyle(liberty())!;
    expect(Object.keys(s.sources)).toEqual(['openmaptiles']);
    expect(s.glyphs).toBe('https://tiles.example/fonts/{fontstack}/{range}.pbf');
    const fonts = new Set(s.layers.flatMap((l) => (l.type === 'symbol' ? [JSON.stringify(l.layout?.['text-font'])] : [])));
    expect(fonts).toEqual(new Set(['["Noto Sans Regular"]', '["Noto Sans Bold"]']));
  });

  it('建物は立体にしない', () => {
    const s = buildGoogleLikeStyle(liberty())!;
    expect(s.layers.some((l) => l.type === 'fill-extrusion')).toBe(false);
    expect(s.layers.find((l) => l.id === 'gm-building')?.type).toBe('fill');
  });

  it('OpenMapTiles 以外のスタイルなら null（元スタイルを使う）', () => {
    const other: StyleSpecification = {
      version: 8,
      sources: { x: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [{ id: 'f', type: 'fill', source: 'x' }],
    };
    expect(buildGoogleLikeStyle(other)).toBeNull();
  });

  it('元スタイルを使うときも建物の立体表現は平面にする', () => {
    const s = flattenBuildings(liberty());
    expect(s.layers.find((l) => l.id === 'building-3d')?.type).toBe('fill');
    expect(validateStyleMin(s)).toEqual([]);
  });
});
