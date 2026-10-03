/**
 * Google マップ共有URLの取り込み（ベストエフォート）。
 *
 * - 公式の Maps URLs（api=1）と、アプリが吐く非公開形式（/place/…/data=!3d…!4d…）を区別して扱う。
 * - 非公開形式への依存はこのファイルに閉じ込める。形式が変わったらここだけ直す。
 * - 座標は「施設の位置（place）」と「地図の表示中心（viewport）」を混同しない。
 * - 名前や住所しか無いときに座標を推測しない。
 *
 * クライアント（長いURL）とサーバー（短縮URL展開後）の両方から使う。DOM に依存しないこと。
 */

export type CoordinateKind = 'place' | 'viewport' | 'unknown';
export type ResolveStatus = 'resolved' | 'partial' | 'unsupported';

export interface MapUrlResult {
  status: ResolveStatus;
  lat: number | null;
  lng: number | null;
  name: string | null;
  coordinateKind: CoordinateKind;
  message: string;
  /** どの経路で解析したか（UI の案内文の出し分け用） */
  source?: 'long' | 'short';
}

export const MESSAGES = {
  placeWithName: '場所の座標と名前を取り込みました。地図でピンの位置を確認してください。',
  placeNoName: '座標を取り込みました。場所名を入力してください。',
  viewport:
    '地図の「表示中心」の座標しか見つかりませんでした。目的地とずれている可能性があるので、ピンを正しい位置へ動かしてください。',
  nameOnly: '場所名は取得できましたが、座標が見つかりませんでした。地図をタップしてピンを置いてください。',
  placeIdOnly:
    'このURLには座標が含まれていません（施設IDのみ）。場所名を入力し、地図をタップしてピンを置いてください。',
  directions:
    '経路（ルート）や複数地点のURLには対応していません。目的地を1か所だけ表示した状態で共有URLを取り直してください。',
  nothing: 'このURLから場所の情報を読み取れませんでした。場所名を入力し、地図をタップしてピンを置いてください。',
  notMaps: 'GoogleマップのURLではないようです。Googleマップの「共有」でコピーしたURLを貼ってください。',
  notUrl: 'URLが見つかりませんでした。「https://」から始まるURLを貼ってください。',
  shortUnresolved: '短縮URLを展開できませんでした。リンクが無効か、一時的に取得できない可能性があります。',
} as const;

const GOOGLE_HOST_RE = /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i;

export function isGoogleHost(host: string): boolean {
  return GOOGLE_HOST_RE.test(host);
}

/** google.com/maps… や maps.google.com/… のような「長い」地図URLか */
export function isLongMapsUrl(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (!isGoogleHost(u.hostname)) return false;
  if (/^maps\./i.test(u.hostname)) return true;
  return u.pathname === '/maps' || u.pathname.startsWith('/maps/');
}

/** サーバーで展開が必要な短縮URLか */
export function isShortMapsUrl(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return u.pathname.length > 1;
  if (host === 'goo.gl') return u.pathname.startsWith('/maps/');
  return false;
}

/** 貼り付けテキストから最初の http(s) URL を取り出す。残りの行は名前のヒントとして返す。 */
export function extractUrlFromText(text: string): { url: string | null; otherLines: string[] } {
  const m = text.match(/https?:\/\/[^\s<>"'「」]+/i);
  const url = m ? m[0].replace(/[)\]、。,.]+$/, '') : null;
  const otherLines = text
    .split(/\r?\n/)
    .map((l) => (m ? l.replace(m[0], '') : l).trim())
    .filter((l) => l.length > 0 && !/^https?:\/\//i.test(l));
  return { url, otherLines };
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg.replace(/\+/g, ' ')).trim();
  } catch {
    return seg.replace(/\+/g, ' ').trim();
  }
}

function inRange(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const DECIMAL_PAIR_RE =
  /^\s*(?:loc:\s*)?([+-]?\d{1,2}(?:\.\d+)?)\s*,\s*([+-]?\d{1,3}(?:\.\d+)?)\s*(?:\((.*)\))?\s*$/i;
const DMS_PART = String.raw`(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')\s*([NSEW])`;
const DMS_PAIR_RE = new RegExp(String.raw`^\s*${DMS_PART}[\s,]+${DMS_PART}\s*$`, 'i');

/**
 * "35.65858, 139.74543" / "loc:35.6,139.7" / "35.6,139.7 (ラベル)" / 35°39'31.0"N 139°44'43.0"E
 * のような座標表記を解析する。座標でなければ null。
 */
export function parseCoordinateText(text: string): { lat: number; lng: number; label: string | null } | null {
  const d = text.match(DECIMAL_PAIR_RE);
  if (d) {
    const lat = Number(d[1]);
    const lng = Number(d[2]);
    if (!inRange(lat, lng)) return null;
    const label = d[3]?.trim() || null;
    return { lat, lng, label };
  }
  const m = text.match(DMS_PAIR_RE);
  if (m) {
    const a = dmsToDecimal(m[1], m[2], m[3], m[4]);
    const b = dmsToDecimal(m[5], m[6], m[7], m[8]);
    const aIsLat = /[NS]/i.test(m[4]);
    const bIsLat = /[NS]/i.test(m[8]);
    if (aIsLat === bIsLat) return null; // N と N など、緯度経度の組になっていない
    const lat = aIsLat ? a : b;
    const lng = aIsLat ? b : a;
    if (!inRange(lat, lng)) return null;
    return { lat, lng, label: null };
  }
  return null;
}

function dmsToDecimal(d: string, m: string, s: string, hemi: string): number {
  const v = Number(d) + Number(m) / 60 + Number(s) / 3600;
  return /[SW]/i.test(hemi) ? -v : v;
}

/** data=…!3d{lat}!4d{lng} 形式の施設座標を探す（非公開形式）。 */
function findDataPlaceCoords(raw: string): { lat: number; lng: number } | null {
  const re = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g;
  const all: { lat: number; lng: number; after8m2: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const before = raw.slice(Math.max(0, m.index - 4), m.index);
    all.push({ lat: Number(m[1]), lng: Number(m[2]), after8m2: before === '!8m2' });
  }
  const valid = all.filter((c) => inRange(c.lat, c.lng));
  const preferred = valid.filter((c) => c.after8m2);
  const pool = preferred.length ? preferred : valid;
  if (pool.length === 0) return null;
  const distinct = new Set(pool.map((c) => `${c.lat},${c.lng}`));
  // 異なる座標が複数ある＝どれが目的地か判断できない。勝手に選ばない。
  if (distinct.size > 1) return null;
  return { lat: pool[0].lat, lng: pool[0].lng };
}

function isDirections(u: URL, segments: string[]): boolean {
  if (segments[0] === 'maps' && segments[1] === 'dir') return true;
  if (u.searchParams.has('daddr') || u.searchParams.has('saddr')) return true;
  if (u.searchParams.has('destination') || u.searchParams.has('waypoints')) return true;
  return false;
}

/** 長いGoogleマップURLを解析する。ネットワークアクセスはしない。 */
export function parseLongMapsUrl(u: URL): MapUrlResult {
  const rawSegments = u.pathname.split('/').filter(Boolean);
  const segments = rawSegments.map(decodeSegment);
  const lower = segments.map((s) => s.toLowerCase());
  const q = u.searchParams;

  if (isDirections(u, lower)) return unsupported(MESSAGES.directions);

  let place: { lat: number; lng: number } | null = null;
  let viewport: { lat: number; lng: number } | null = null;
  let name: string | null = null;
  let searchText: string | null = null;
  let hasPlaceId = false;

  // 1) 非公開形式 data=!3d!4d（施設座標）
  place = findDataPlaceCoords(u.pathname + u.search);

  // 2) /maps/place/<名前 or 座標>/ と /maps/search/<検索語>/
  const mapsIdx = lower.indexOf('maps');
  const afterMaps = mapsIdx >= 0 ? segments.slice(mapsIdx + 1) : segments;
  const afterMapsLower = afterMaps.map((s) => s.toLowerCase());
  for (const kw of ['place', 'search'] as const) {
    const i = afterMapsLower.indexOf(kw);
    if (i < 0) continue;
    const seg = afterMaps[i + 1];
    if (!seg || seg.startsWith('@') || seg.startsWith('data=')) continue;
    const coords = parseCoordinateText(seg);
    if (coords) {
      place ??= { lat: coords.lat, lng: coords.lng };
    } else if (kw === 'place') {
      name = seg;
    } else {
      searchText = seg;
    }
  }

  // 3) クエリ（公式 api=1 の query / 旧形式 q）
  for (const key of ['query', 'q'] as const) {
    const val = q.get(key);
    if (!val) continue;
    if (/^place_id:/i.test(val)) {
      hasPlaceId = true;
      continue;
    }
    const coords = parseCoordinateText(val);
    if (coords) {
      place ??= { lat: coords.lat, lng: coords.lng };
      if (coords.label) name ??= coords.label;
    } else {
      searchText ??= val.trim();
    }
  }
  if (q.has('query_place_id') || q.has('place_id') || q.has('cid') || q.has('ftid')) hasPlaceId = true;
  if (/!1s0x[0-9a-f]+:0x[0-9a-f]+/i.test(u.pathname)) hasPlaceId = true;

  // 4) 表示中心（@lat,lng,zoom / ll= / center=）
  for (const seg of afterMaps) {
    const m = seg.match(/^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/);
    if (m && inRange(Number(m[1]), Number(m[2]))) {
      viewport = { lat: Number(m[1]), lng: Number(m[2]) };
      break;
    }
  }
  for (const key of ['ll', 'center', 'sll'] as const) {
    if (viewport) break;
    const val = q.get(key);
    const coords = val ? parseCoordinateText(val) : null;
    if (coords) viewport = { lat: coords.lat, lng: coords.lng };
  }

  const finalName = clean(name ?? searchText);

  if (place) {
    return {
      status: 'resolved',
      lat: place.lat,
      lng: place.lng,
      name: finalName,
      coordinateKind: 'place',
      message: finalName ? MESSAGES.placeWithName : MESSAGES.placeNoName,
    };
  }
  if (viewport) {
    return {
      status: 'partial',
      lat: viewport.lat,
      lng: viewport.lng,
      name: finalName,
      coordinateKind: 'viewport',
      message: MESSAGES.viewport,
    };
  }
  if (finalName) {
    return {
      status: 'partial',
      lat: null,
      lng: null,
      name: finalName,
      coordinateKind: 'unknown',
      message: MESSAGES.nameOnly,
    };
  }
  return unsupported(hasPlaceId ? MESSAGES.placeIdOnly : MESSAGES.nothing);
}

function clean(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return Array.from(t).slice(0, 100).join('');
}

export function unsupported(message: string): MapUrlResult {
  return { status: 'unsupported', lat: null, lng: null, name: null, coordinateKind: 'unknown', message };
}

/**
 * consent.google.com の同意画面に飛ばされた場合、continue= に本来の地図URLが入っている。
 * それを取り出す（取得はしない）。
 */
export function unwrapConsentUrl(u: URL): URL | null {
  if (u.hostname.toLowerCase() !== 'consent.google.com') return null;
  const cont = u.searchParams.get('continue');
  if (!cont) return null;
  try {
    return new URL(cont);
  } catch {
    return null;
  }
}

export type InputClassification =
  | { kind: 'long'; url: URL; hintLines: string[] }
  | { kind: 'short'; url: URL; hintLines: string[] }
  | { kind: 'invalid'; message: string };

/** 貼り付けられた入力を分類する（クライアント側）。 */
export function classifyInput(text: string): InputClassification {
  const { url, otherLines } = extractUrlFromText(text.trim());
  if (!url) return { kind: 'invalid', message: MESSAGES.notUrl };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'invalid', message: MESSAGES.notUrl };
  }
  const unwrapped = unwrapConsentUrl(u);
  if (unwrapped) u = unwrapped;
  if (isLongMapsUrl(u)) return { kind: 'long', url: u, hintLines: otherLines };
  if (isShortMapsUrl(u)) return { kind: 'short', url: u, hintLines: otherLines };
  return { kind: 'invalid', message: MESSAGES.notMaps };
}
