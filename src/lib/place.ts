/**
 * 共有URLに載せる地点データの定義と、エンコード／デコード／検証。
 * サーバー保存に頼らず、URLだけで同じ地点を復元できることが前提。
 */

export interface Place {
  lat: number;
  lng: number;
  name: string;
  /** 任意のイベント名（例：「○○さん送別会」） */
  event?: string;
  note?: string;
  zoom: number;
}

export const URL_VERSION = '1';
export const DEFAULT_ZOOM = 17;
export const MIN_ZOOM = 15;
export const MAX_ZOOM = 19;
export const NAME_MAX = 100;
export const NOTE_MAX = 200;
export const EVENT_MAX = 100;
/** Web メルカトルで表示できる緯度の上限。これを超える地点は丸めずにエラーにする。 */
export const MAX_MERCATOR_LAT = 85.051129;
export const COORD_DECIMALS = 6;

const KNOWN_KEYS = ['v', 'lat', 'lng', 'name', 'event', 'note', 'z'] as const;

export type ParseResult =
  | { kind: 'empty' }
  | { kind: 'ok'; place: Place }
  | { kind: 'error'; errors: string[] };

/** 文字数はコードポイント単位で数える（絵文字1つ＝1文字）。 */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/** 厳密な10進表記のみ受け付ける。"", "1e3", "0x10", " 1" などは不正。 */
export function parseDecimal(raw: string): number | null {
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function validateLat(lat: number): string | null {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return '緯度は -90〜90 の数値で指定してください。';
  if (Math.abs(lat) > MAX_MERCATOR_LAT) {
    return `この地図で表示できる緯度は ±${MAX_MERCATOR_LAT.toFixed(2)} 度までです（極地は非対応）。`;
  }
  return null;
}

export function validateLng(lng: number): string | null {
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return '経度は -180〜180 の数値で指定してください。';
  return null;
}

export function normalizeName(name: string): string {
  return name.trim();
}

export function validateName(name: string): string | null {
  const n = normalizeName(name);
  if (n.length === 0) return '場所名を入力してください。';
  if (charLength(n) > NAME_MAX) return `場所名は${NAME_MAX}文字以内にしてください。`;
  return null;
}

export function validateNote(note: string): string | null {
  if (charLength(note.trim()) > NOTE_MAX) return `補足は${NOTE_MAX}文字以内にしてください。`;
  return null;
}

export function validateEvent(event: string): string | null {
  if (charLength(event.trim()) > EVENT_MAX) return `イベント名は${EVENT_MAX}文字以内にしてください。`;
  return null;
}

export function validateZoom(z: number): string | null {
  if (!Number.isFinite(z) || z < MIN_ZOOM || z > MAX_ZOOM) {
    return `倍率(z)は ${MIN_ZOOM}〜${MAX_ZOOM} で指定してください。`;
  }
  return null;
}

/** 入力値から Place を組み立てる。問題があればエラー文の配列を返す。 */
export function validatePlace(input: {
  lat: number;
  lng: number;
  name: string;
  event?: string;
  note?: string;
  zoom?: number;
}): { ok: true; place: Place } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const latErr = validateLat(input.lat);
  if (latErr) errors.push(latErr);
  const lngErr = validateLng(input.lng);
  if (lngErr) errors.push(lngErr);
  const nameErr = validateName(input.name);
  if (nameErr) errors.push(nameErr);
  const event = (input.event ?? '').trim();
  const eventErr = validateEvent(event);
  if (eventErr) errors.push(eventErr);
  const note = (input.note ?? '').trim();
  const noteErr = validateNote(note);
  if (noteErr) errors.push(noteErr);
  const zoom = input.zoom ?? DEFAULT_ZOOM;
  const zErr = validateZoom(zoom);
  if (zErr) errors.push(zErr);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    place: {
      lat: roundCoord(input.lat),
      lng: roundCoord(input.lng),
      name: normalizeName(input.name),
      ...(event ? { event } : {}),
      ...(note ? { note } : {}),
      zoom,
    },
  };
}

export function roundCoord(n: number): number {
  const r = Number(n.toFixed(COORD_DECIMALS));
  return Object.is(r, -0) ? 0 : r;
}

export function formatCoord(n: number): string {
  return roundCoord(n).toFixed(COORD_DECIMALS);
}

/**
 * URL の検索文字列から地点を復元する。
 * 既知パラメータが1つも無ければ 'empty'（＝入力モード）。
 * 未知のパラメータ（utm_* など）は無視する。
 */
export function parsePlaceParams(search: string | URLSearchParams): ParseResult {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const present = KNOWN_KEYS.filter((k) => params.has(k));
  if (present.length === 0) return { kind: 'empty' };

  const errors: string[] = [];
  for (const k of present) {
    if (params.getAll(k).length > 1) errors.push(`パラメータ「${k}」が重複しています。`);
  }
  if (errors.length) return { kind: 'error', errors };

  const v = params.get('v');
  if (v !== null && v !== URL_VERSION) {
    return { kind: 'error', errors: [`未対応のURL形式です（v=${v}）。新しいバージョンのアプリで作られた可能性があります。`] };
  }

  const latRaw = params.get('lat');
  const lngRaw = params.get('lng');
  const nameRaw = params.get('name');
  const noteRaw = params.get('note');
  const eventRaw = params.get('event');
  const zRaw = params.get('z');

  let lat = NaN;
  let lng = NaN;
  if (latRaw === null) errors.push('緯度(lat)がありません。');
  else {
    const n = parseDecimal(latRaw);
    if (n === null) errors.push('緯度(lat)が数値ではありません。');
    else lat = n;
  }
  if (lngRaw === null) errors.push('経度(lng)がありません。');
  else {
    const n = parseDecimal(lngRaw);
    if (n === null) errors.push('経度(lng)が数値ではありません。');
    else lng = n;
  }
  if (nameRaw === null) errors.push('場所名(name)がありません。');

  let zoom = DEFAULT_ZOOM;
  if (zRaw !== null) {
    const n = parseDecimal(zRaw);
    if (n === null) errors.push('倍率(z)が数値ではありません。');
    else zoom = n;
  }
  if (errors.length) return { kind: 'error', errors };

  const res = validatePlace({
    lat,
    lng,
    name: nameRaw ?? '',
    event: eventRaw ?? undefined,
    note: noteRaw ?? undefined,
    zoom,
  });
  if (!res.ok) return { kind: 'error', errors: res.errors };
  // 受け取った座標はそのまま（丸め済みでも未丸めでも）尊重する。
  return { kind: 'ok', place: { ...res.place, lat, lng } };
}

/** 既知パラメータだけで共有用のクエリ文字列を組み立てる。 */
export function buildPlaceQuery(place: Place): string {
  const p = new URLSearchParams();
  p.set('v', URL_VERSION);
  p.set('lat', formatCoord(place.lat));
  p.set('lng', formatCoord(place.lng));
  p.set('name', place.name);
  if (place.event) p.set('event', place.event);
  if (place.note) p.set('note', place.note);
  p.set('z', String(place.zoom));
  // URLSearchParams は空白を "+" にする。アプリによって "+" の扱いが揺れるので %20 に統一する。
  // （リテラルの "+" は %2B にエンコード済みなので、ここに残る "+" はすべて空白。）
  return p.toString().replace(/\+/g, '%20');
}

/** baseUrl の origin + pathname に地点クエリを付けた共有URLを作る（他のクエリ・ハッシュは捨てる）。 */
export function buildShareUrl(baseUrl: string, place: Place): string {
  const u = new URL(baseUrl);
  return `${u.origin}${u.pathname}?${buildPlaceQuery(place)}`;
}

/** 公式 Maps URLs 形式で、確定座標を Google マップで開くリンク。 */
export function googleMapsSearchUrl(place: Pick<Place, 'lat' | 'lng'>): string {
  const q = `${formatCoord(place.lat)},${formatCoord(place.lng)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
