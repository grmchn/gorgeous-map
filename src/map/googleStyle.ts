import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';

/**
 * Google マップ風の見た目（フラット・色分けあり）のレイヤー一式。
 * OpenMapTiles スキーマのベクタータイル（OpenFreeMap など）用。
 *
 * 元のスタイル（OpenFreeMap liberty 等）からはタイルの取得先（sources）と文字（glyphs）だけを借り、
 * レイヤーはすべてここで定義する。こうすると配信元の見た目変更の影響を受けず、建物も立体にならない。
 * 元スタイルが OpenMapTiles スキーマでなければ null を返す（呼び出し側は元スタイルを使う）。
 */

/** 色はここでまとめて調整する */
export const GM = {
  landLow: '#dfe8d3',
  land: '#f2f3ef',
  urban: '#ebecea',
  commercial: '#fbefe2',
  industrial: '#ece9f1',
  hospital: '#fbe3e1',
  school: '#f3ecdc',
  park: '#c9e9bf',
  grass: '#d6edcb',
  wood: '#bfe0b4',
  farmland: '#eef0df',
  wetland: '#d5ebe0',
  sand: '#f6eed4',
  ice: '#fafcff',
  cemetery: '#d9e8d4',
  railwayArea: '#e9e7ee',
  water: '#9fcaf6',
  waterLabel: '#3f78b8',
  aeroway: '#e3e3ea',
  buildingLow: '#ece8e2',
  buildingMid: '#e3e2e8',
  buildingHigh: '#d7d9e2',
  buildingOutline: '#cfcbc4',
  motorway: '#f9d46c',
  motorwayCasing: '#e2a93a',
  trunk: '#fde39a',
  trunkCasing: '#e8be62',
  road: '#ffffff',
  roadCasing: '#d5d2cc',
  minorCasing: '#dedbd5',
  path: '#d2cfca',
  rail: '#b9b6c0',
  ferry: '#77aee8',
  border: '#a09cb3',
  text: '#5f6368',
  textDark: '#3c4043',
  halo: '#ffffff',
} as const;

/** POI の分類と色（Google マップの色分けに近づける） */
export const POI_CATEGORIES: Record<string, { color: string; classes: string[] }> = {
  food: { color: '#ef8a17', classes: ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'bakery', 'food_court', 'pub'] },
  shop: { color: '#4b7fe0', classes: ['shop', 'grocery', 'clothing_store', 'department_store', 'convenience', 'mall', 'books', 'hardware', 'furniture', 'electronics', 'jewelry', 'alcohol_shop', 'florist', 'music', 'gift', 'laundry'] },
  lodging: { color: '#de5b98', classes: ['lodging', 'hotel', 'hostel', 'motel', 'guest_house'] },
  health: { color: '#e6524c', classes: ['hospital', 'doctors', 'pharmacy', 'dentist', 'clinic', 'veterinary'] },
  nature: { color: '#3aa35b', classes: ['park', 'garden', 'zoo', 'campsite', 'playground', 'golf', 'pitch', 'stadium', 'swimming'] },
  culture: { color: '#1b9e9e', classes: ['attraction', 'museum', 'theatre', 'cinema', 'art_gallery', 'monument', 'castle', 'aquarium', 'library'] },
  transit: { color: '#4277d6', classes: ['bus', 'railway', 'airport', 'aerialway', 'ferry_terminal', 'harbor', 'parking', 'fuel', 'bicycle_rental'] },
  civic: { color: '#7c8291', classes: ['town_hall', 'post', 'police', 'fire_station', 'school', 'college', 'kindergarten', 'bank', 'place_of_worship', 'religion', 'toilets'] },
};

const OMT_LAYERS = ['transportation', 'water', 'building', 'place'];

type Expr = ExpressionSpecification;
const zoomInterp = (stops: [number, unknown][], base = 1.5): Expr =>
  ['interpolate', ['exponential', base], ['zoom'], ...stops.flat()] as unknown as Expr;
const cls = (...classes: string[]): Expr => ['match', ['get', 'class'], classes, true, false] as Expr;
const nameJa: Expr = ['coalesce', ['get', 'name:ja'], ['get', 'name']];

/** POI の分類 → 色（match 式） */
function poiCategoryExpr(): Expr {
  const arms: unknown[] = [];
  for (const [key, c] of Object.entries(POI_CATEGORIES)) arms.push(c.classes, key);
  return ['match', ['get', 'class'], ...arms, 'other'] as unknown as Expr;
}

function poiColorExpr(): DataDrivenPropertyValueSpecification<string> {
  const arms: unknown[] = [];
  for (const c of Object.values(POI_CATEGORIES)) arms.push(c.classes, c.color);
  return ['match', ['get', 'class'], ...arms, '#7c8291'] as unknown as DataDrivenPropertyValueSpecification<string>;
}

interface RoadSpec {
  id: string;
  classes: string[];
  minzoom: number;
  width: [number, number][];
  color: string;
  casing: string;
}

const ROADS: RoadSpec[] = [
  { id: 'service', classes: ['service', 'track'], minzoom: 14, width: [[14, 1], [17, 5], [20, 14]], color: GM.road, casing: GM.minorCasing },
  { id: 'minor', classes: ['minor'], minzoom: 12, width: [[12, 0.5], [14, 2.6], [17, 9], [20, 26]], color: GM.road, casing: GM.minorCasing },
  { id: 'secondary', classes: ['secondary', 'tertiary'], minzoom: 9, width: [[9, 0.5], [12, 1.6], [14, 4.5], [17, 13], [20, 34]], color: GM.road, casing: GM.roadCasing },
  { id: 'primary', classes: ['primary'], minzoom: 7, width: [[7, 0.5], [10, 1.6], [14, 6], [17, 16], [20, 40]], color: GM.road, casing: GM.roadCasing },
  { id: 'trunk', classes: ['trunk'], minzoom: 5, width: [[5, 0.4], [10, 2], [14, 6.5], [17, 17], [20, 42]], color: GM.trunk, casing: GM.trunkCasing },
  { id: 'motorway', classes: ['motorway'], minzoom: 4, width: [[4, 0.4], [10, 2.4], [14, 7], [17, 18], [20, 46]], color: GM.motorway, casing: GM.motorwayCasing },
];

/**
 * 元スタイルから OpenMapTiles のソースと glyphs を借りて、Google 風レイヤーのスタイルを作る。
 */
export function buildGoogleLikeStyle(base: StyleSpecification): StyleSpecification | null {
  // OpenMapTiles スキーマのソースを探す（レイヤーの source-layer から判定）
  let sourceId: string | null = null;
  for (const l of base.layers) {
    if ('source-layer' in l && l['source-layer'] && OMT_LAYERS.includes(l['source-layer']) && 'source' in l) {
      sourceId = l.source as string;
      break;
    }
  }
  if (!sourceId || !base.sources[sourceId] || base.sources[sourceId].type !== 'vector') return null;
  if (!base.glyphs) return null;

  const { regular, bold } = pickFonts(base);
  const S = sourceId;
  const layers: LayerSpecification[] = [];
  const add = (l: LayerSpecification) => layers.push(l);

  add({
    id: 'gm-background',
    type: 'background',
    paint: { 'background-color': ['interpolate', ['linear'], ['zoom'], 0, GM.landLow, 6, GM.land] as Expr },
  });

  // ---- 地面の色分け ----
  const landcover: [string, string[]][] = [
    [GM.wood, ['wood', 'forest']],
    [GM.grass, ['grass', 'meadow', 'scrub']],
    [GM.farmland, ['farmland']],
    [GM.wetland, ['wetland']],
    [GM.sand, ['sand', 'beach']],
    [GM.ice, ['ice', 'glacier']],
  ];
  add({
    id: 'gm-landcover',
    type: 'fill',
    source: S,
    'source-layer': 'landcover',
    paint: {
      'fill-color': ['match', ['get', 'class'], ...landcover.flatMap(([c, k]) => [k, c]), GM.grass] as unknown as Expr,
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.85, 12, 0.7, 16, 0.55] as Expr,
      'fill-antialias': false,
    },
  });
  const landuse: [string, string[]][] = [
    [GM.urban, ['residential', 'suburb', 'neighbourhood', 'quarter']],
    [GM.commercial, ['commercial', 'retail']],
    [GM.industrial, ['industrial', 'garages', 'dam']],
    [GM.hospital, ['hospital']],
    [GM.school, ['school', 'university', 'college', 'kindergarten']],
    [GM.park, ['park', 'garden', 'playground', 'pitch', 'stadium', 'zoo', 'theme_park']],
    [GM.cemetery, ['cemetery']],
    [GM.railwayArea, ['railway']],
    [GM.hospital, ['military']],
  ];
  add({
    id: 'gm-landuse',
    type: 'fill',
    source: S,
    'source-layer': 'landuse',
    minzoom: 8,
    paint: {
      'fill-color': ['match', ['get', 'class'], ...landuse.flatMap(([c, k]) => [k, c]), GM.urban] as unknown as Expr,
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 10, 1] as Expr,
    },
  });
  add({
    id: 'gm-park',
    type: 'fill',
    source: S,
    'source-layer': 'park',
    paint: { 'fill-color': GM.park, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 10, 0.9] as Expr },
  });
  add({
    id: 'gm-aeroway',
    type: 'fill',
    source: S,
    'source-layer': 'aeroway',
    minzoom: 11,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': GM.aeroway },
  });

  // ---- 水 ----
  add({
    id: 'gm-water',
    type: 'fill',
    source: S,
    'source-layer': 'water',
    paint: { 'fill-color': GM.water },
  });
  add({
    id: 'gm-waterway',
    type: 'line',
    source: S,
    'source-layer': 'waterway',
    minzoom: 8,
    paint: {
      'line-color': GM.water,
      'line-width': zoomInterp([[8, 0.5], [13, 1.5], [17, 6], [20, 14]]),
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });

  // ---- 建物（立体にしない。高さで少しずつ色を変える） ----
  add({
    id: 'gm-building',
    type: 'fill',
    source: S,
    'source-layer': 'building',
    minzoom: 13,
    paint: {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'render_height'], 6],
        0,
        GM.buildingLow,
        15,
        GM.buildingMid,
        60,
        GM.buildingHigh,
      ] as Expr,
      'fill-outline-color': GM.buildingOutline,
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1] as Expr,
    },
  });

  // ---- 境界 ----
  add({
    id: 'gm-boundary-state',
    type: 'line',
    source: S,
    'source-layer': 'boundary',
    filter: ['all', ['>=', ['get', 'admin_level'], 3], ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
    minzoom: 4,
    paint: { 'line-color': GM.border, 'line-width': 0.8, 'line-dasharray': [3, 2], 'line-opacity': 0.6 },
  });
  add({
    id: 'gm-boundary-country',
    type: 'line',
    source: S,
    'source-layer': 'boundary',
    filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
    paint: { 'line-color': GM.border, 'line-width': zoomInterp([[0, 0.6], [6, 1.2], [12, 2]]) },
  });

  // ---- 道路（縁取り → 中身の順。細い道から太い道へ） ----
  const notTunnel: Expr = ['!=', ['get', 'brunnel'], 'tunnel'];
  add({
    id: 'gm-path',
    type: 'line',
    source: S,
    'source-layer': 'transportation',
    minzoom: 15,
    filter: ['all', cls('path'), notTunnel],
    paint: { 'line-color': GM.path, 'line-width': zoomInterp([[15, 0.8], [18, 2.2]]), 'line-dasharray': [1.5, 1.2] },
  });
  for (const r of ROADS) {
    add({
      id: `gm-road-${r.id}-casing`,
      type: 'line',
      source: S,
      'source-layer': 'transportation',
      minzoom: r.minzoom,
      filter: ['all', cls(...r.classes), notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': r.casing,
        'line-width': zoomInterp(r.width.map(([z, w]) => [z, w + Math.min(3, Math.max(1, w * 0.18)) * 2])),
      },
    });
  }
  for (const r of ROADS) {
    add({
      id: `gm-road-${r.id}`,
      type: 'line',
      source: S,
      'source-layer': 'transportation',
      minzoom: r.minzoom,
      filter: ['all', cls(...r.classes), notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': r.color, 'line-width': zoomInterp(r.width) },
    });
  }
  add({
    id: 'gm-rail',
    type: 'line',
    source: S,
    'source-layer': 'transportation',
    minzoom: 9,
    filter: ['all', cls('rail', 'transit'), notTunnel],
    paint: { 'line-color': GM.rail, 'line-width': zoomInterp([[9, 0.6], [14, 1.6], [18, 3]]) },
  });
  add({
    id: 'gm-rail-hatch',
    type: 'line',
    source: S,
    'source-layer': 'transportation',
    minzoom: 14,
    filter: ['all', cls('rail', 'transit'), notTunnel],
    paint: { 'line-color': '#ffffff', 'line-width': zoomInterp([[14, 0.8], [18, 1.6]]), 'line-dasharray': [3, 3] },
  });
  add({
    id: 'gm-ferry',
    type: 'line',
    source: S,
    'source-layer': 'transportation',
    minzoom: 8,
    filter: cls('ferry'),
    paint: { 'line-color': GM.ferry, 'line-width': 1, 'line-dasharray': [3, 2] },
  });

  // ---- 文字 ----
  const halo = { 'text-halo-color': GM.halo, 'text-halo-width': 1.6, 'text-halo-blur': 0.3 };
  add({
    id: 'gm-water-name',
    type: 'symbol',
    source: S,
    'source-layer': 'water_name',
    layout: {
      'text-field': nameJa,
      'text-font': regular,
      'text-size': zoomInterp([[0, 10], [8, 13], [14, 14]]),
      'text-max-width': 6,
      'symbol-placement': ['step', ['zoom'], 'point', 10, 'line'] as never,
    },
    paint: { 'text-color': GM.waterLabel, ...halo, 'text-halo-color': 'rgba(255,255,255,0.6)' },
  });
  add({
    id: 'gm-road-name',
    type: 'symbol',
    source: S,
    'source-layer': 'transportation_name',
    minzoom: 13,
    layout: {
      'symbol-placement': 'line',
      'text-field': nameJa,
      'text-font': regular,
      'text-size': zoomInterp([[13, 10], [17, 12.5], [20, 14]]),
      'text-max-angle': 30,
      'symbol-spacing': 320,
    },
    paint: { 'text-color': GM.text, ...halo },
  });
  add({
    id: 'gm-housenumber',
    type: 'symbol',
    source: S,
    'source-layer': 'housenumber',
    minzoom: 17,
    layout: { 'text-field': ['get', 'housenumber'], 'text-font': regular, 'text-size': 10 },
    paint: { 'text-color': '#9b9894', ...halo },
  });

  // POI：分類ごとの色の丸アイコン＋同系色の名前（アイコン画像は installPoiIcons() で生成）
  add({
    id: 'gm-poi',
    type: 'symbol',
    source: S,
    'source-layer': 'poi',
    minzoom: 14,
    filter: ['all', ['has', 'name'], ['<=', ['coalesce', ['get', 'rank'], 99], ['step', ['zoom'], 6, 15, 14, 16, 30, 17, 99]]],
    layout: {
      'icon-image': ['concat', 'gm-poi-', poiCategoryExpr()] as Expr,
      'icon-size': 1,
      'text-field': nameJa,
      'text-font': regular,
      'text-size': zoomInterp([[14, 10.5], [18, 12.5]]),
      'text-anchor': 'left',
      'text-offset': [0.9, 0],
      'text-max-width': 8,
      'text-optional': true,
    },
    paint: { 'text-color': poiColorExpr(), ...halo },
  });

  // 地名
  add({
    id: 'gm-place-minor',
    type: 'symbol',
    source: S,
    'source-layer': 'place',
    minzoom: 12,
    filter: cls('suburb', 'neighbourhood', 'quarter', 'hamlet', 'isolated_dwelling'),
    layout: { 'text-field': nameJa, 'text-font': regular, 'text-size': zoomInterp([[12, 11], [16, 13]]), 'text-max-width': 7 },
    paint: { 'text-color': '#7a7d82', ...halo },
  });
  add({
    id: 'gm-place-town',
    type: 'symbol',
    source: S,
    'source-layer': 'place',
    minzoom: 8,
    filter: cls('town', 'village'),
    layout: { 'text-field': nameJa, 'text-font': regular, 'text-size': zoomInterp([[8, 11], [14, 15]]), 'text-max-width': 7 },
    paint: { 'text-color': GM.textDark, ...halo },
  });
  add({
    id: 'gm-place-city',
    type: 'symbol',
    source: S,
    'source-layer': 'place',
    minzoom: 4,
    filter: cls('city'),
    layout: {
      'text-field': nameJa,
      'text-font': bold,
      'text-size': zoomInterp([[4, 11], [8, 14], [12, 18]]),
      'text-max-width': 7,
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] as Expr,
    },
    paint: { 'text-color': GM.textDark, ...halo },
  });
  add({
    id: 'gm-place-state',
    type: 'symbol',
    source: S,
    'source-layer': 'place',
    minzoom: 4,
    maxzoom: 9,
    filter: cls('state', 'province'),
    layout: { 'text-field': nameJa, 'text-font': regular, 'text-size': 12, 'text-max-width': 6 },
    paint: { 'text-color': '#8a8790', ...halo },
  });
  add({
    id: 'gm-place-country',
    type: 'symbol',
    source: S,
    'source-layer': 'place',
    maxzoom: 7,
    filter: cls('country'),
    layout: {
      'text-field': nameJa,
      'text-font': bold,
      'text-size': zoomInterp([[1, 10], [4, 14], [6, 17]]),
      'text-max-width': 6,
    },
    paint: { 'text-color': '#4a4d55', ...halo },
  });

  return {
    version: 8,
    name: 'gorgeous-google-like',
    sources: { [S]: base.sources[S] },
    glyphs: base.glyphs,
    layers,
  };
}

/** 元スタイルで使われているフォント名を借りる（配信元にあるフォントでないと文字が出ないため） */
function pickFonts(base: StyleSpecification): { regular: string[]; bold: string[] } {
  const stacks: string[][] = [];
  for (const l of base.layers) {
    if (l.type !== 'symbol') continue;
    const tf = l.layout?.['text-font'];
    if (Array.isArray(tf) && tf.every((x) => typeof x === 'string')) stacks.push(tf as string[]);
  }
  const regular = stacks.find((s) => s.some((f) => /regular/i.test(f))) ?? stacks[0] ?? ['Noto Sans Regular'];
  const bold = stacks.find((s) => s.some((f) => /bold/i.test(f))) ?? regular;
  return { regular, bold };
}

/**
 * Google 風スタイルにできなかったとき（配信元のスタイルをそのまま使うとき）でも、
 * 建物は立体にせず平面で塗る。
 */
export function flattenBuildings(style: StyleSpecification): StyleSpecification {
  style.layers = style.layers.map((l) => {
    if (l.type !== 'fill-extrusion') return l;
    const flat: LayerSpecification = {
      id: l.id,
      type: 'fill',
      source: l.source,
      ...(l['source-layer'] ? { 'source-layer': l['source-layer'] } : {}),
      ...(l.filter ? { filter: l.filter } : {}),
      ...(l.minzoom !== undefined ? { minzoom: l.minzoom } : {}),
      paint: { 'fill-color': GM.buildingMid, 'fill-outline-color': GM.buildingOutline },
    };
    return flat;
  });
  return style;
}

/** POI 用の丸アイコンをその場で描いて登録する（スプライト画像に頼らない） */
export function installPoiIcons(map: {
  setMissingStyleImageResolver: (resolver: ((id: string) => void) | null) => unknown;
  hasImage: (id: string) => boolean;
  addImage: (id: string, img: ImageData, opts?: { pixelRatio?: number }) => void;
}): void {
  map.setMissingStyleImageResolver((id) => {
    if (!id.startsWith('gm-poi-') || map.hasImage(id)) return;
    const img = drawPoiIcon(POI_CATEGORIES[id.slice('gm-poi-'.length)]?.color ?? '#7c8291');
    if (img) map.addImage(id, img, { pixelRatio: 2 });
  });
}

function drawPoiIcon(color: string): ImageData | null {
  const pr = 2;
  const size = 18 * pr;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 1.5 * pr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2 * pr;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}
