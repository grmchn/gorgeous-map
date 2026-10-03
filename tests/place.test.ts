import { describe, expect, it } from 'vitest';
import {
  buildShareUrl,
  googleMapsSearchUrl,
  parsePlaceParams,
  validatePlace,
  type Place,
} from '../src/lib/place';

const BASE = 'https://example.app/';

function roundTrip(place: Place): Place {
  const url = new URL(buildShareUrl(BASE, place));
  const res = parsePlaceParams(url.search);
  if (res.kind !== 'ok') throw new Error(JSON.stringify(res));
  return res.place;
}

describe('共有URLの往復', () => {
  it('基本の往復', () => {
    const p: Place = { lat: 35.658581, lng: 139.745433, name: '東京タワー 正面玄関', zoom: 17 };
    expect(roundTrip(p)).toEqual(p);
  });

  it.each([
    ['南緯・西経', -22.951916, -43.210487],
    ['0度ちょうど', 0, 0],
    ['日付変更線（東）', -16.5, 179.999999],
    ['日付変更線（西）', -16.5, -179.999999],
    ['経度 ±180', 10, 180],
    ['経度 -180', 10, -180],
  ])('%s でも緯度経度を取り違えない', (_label, lat, lng) => {
    const r = roundTrip({ lat, lng, name: 'x', zoom: 17 });
    expect(r.lat).toBe(lat);
    expect(r.lng).toBe(lng);
  });

  it.each([
    '日本語 と 空白',
    'A&B #2 ?x=1',
    '100% 🍣🍜 ラーメン',
    'プラス+記号 と =イコール',
    '"quote" <tag> \'single\'',
    '改行なし\tタブ',
  ])('名称 %s が壊れない', (name) => {
    const r = roundTrip({ lat: 1, lng: 2, name, note: `補足: ${name}`, zoom: 18 });
    expect(r.name).toBe(name.trim());
    expect(r.note).toBe(`補足: ${name}`.trim());
    expect(r.zoom).toBe(18);
  });

  it('イベント名（任意）も往復する', () => {
    const p: Place = { lat: 35, lng: 139, name: '○○ホール 正面', event: '🎉 佐藤さん送別会 & 二次会 #1', zoom: 17 };
    expect(roundTrip(p)).toEqual(p);
    const url = buildShareUrl(BASE, p);
    expect(url.indexOf('event=')).toBeGreaterThan(url.indexOf('name='));
  });

  it('イベント名が空ならパラメータを出さない', () => {
    const res = validatePlace({ lat: 1, lng: 2, name: 'n', event: '  ' });
    if (!res.ok) throw new Error('invalid');
    expect('event' in res.place).toBe(false);
    expect(buildShareUrl(BASE, res.place)).not.toContain('event=');
  });

  it('空白は %20 にエンコードされる', () => {
    const url = buildShareUrl(BASE, { lat: 1, lng: 2, name: 'a b', zoom: 17 });
    expect(url).toContain('name=a%20b');
    expect(url).not.toContain('+');
  });

  it('既知パラメータ以外・ハッシュは共有URLに混ぜない', () => {
    const url = buildShareUrl('https://example.app/?preview=1&utm_source=x#frag', {
      lat: 1,
      lng: 2,
      name: 'n',
      zoom: 17,
    });
    expect(url).toBe('https://example.app/?v=1&lat=1.000000&lng=2.000000&name=n&z=17');
  });

  it('補足が空ならパラメータを出さない', () => {
    const res = validatePlace({ lat: 1, lng: 2, name: 'n', note: '   ' });
    if (!res.ok) throw new Error('invalid');
    expect('note' in res.place).toBe(false);
    expect(buildShareUrl(BASE, res.place)).not.toContain('note=');
  });

  it('座標を6桁に丸め、-0 を 0 にする', () => {
    const url = buildShareUrl(BASE, { lat: -0.0000001, lng: 139.12345678, name: 'n', zoom: 17 });
    expect(url).toContain('lat=0.000000');
    expect(url).toContain('lng=139.123457');
  });
});

describe('URLパラメータの検証', () => {
  it('既知パラメータが無ければ入力モード', () => {
    expect(parsePlaceParams('').kind).toBe('empty');
    expect(parsePlaceParams('?utm_source=line&fbclid=1').kind).toBe('empty');
  });

  it('v 省略時は 1 扱い、z 省略時は 17', () => {
    const r = parsePlaceParams('?lat=1&lng=2&name=x');
    expect(r).toEqual({ kind: 'ok', place: { lat: 1, lng: 2, name: 'x', zoom: 17 } });
  });

  it('未知のパラメータは無視', () => {
    expect(parsePlaceParams('?lat=1&lng=2&name=x&fbclid=abc').kind).toBe('ok');
  });

  it.each([
    ['必須欠落 lat', '?lng=2&name=x'],
    ['必須欠落 lng', '?lat=1&name=x'],
    ['必須欠落 name', '?lat=1&lng=2'],
    ['name 空白のみ', '?lat=1&lng=2&name=%20%20'],
    ['name 101文字', `?lat=1&lng=2&name=${'あ'.repeat(101)}`],
    ['note 201文字', `?lat=1&lng=2&name=x&note=${'a'.repeat(201)}`],
    ['event 101文字', `?lat=1&lng=2&name=x&event=${'a'.repeat(101)}`],
    ['event 重複', '?lat=1&lng=2&name=x&event=a&event=b'],
    ['緯度範囲外', '?lat=91&lng=2&name=x'],
    ['極域（メルカトル範囲外）', '?lat=89&lng=2&name=x'],
    ['経度範囲外', '?lat=1&lng=180.5&name=x'],
    ['数値でない', '?lat=abc&lng=2&name=x'],
    ['空文字の lat（0扱いしない）', '?lat=&lng=2&name=x'],
    ['指数表記', '?lat=1e1&lng=2&name=x'],
    ['Infinity', '?lat=Infinity&lng=2&name=x'],
    ['16進', '?lat=0x10&lng=2&name=x'],
    ['重複', '?lat=1&lat=2&lng=2&name=x'],
    ['name 重複', '?lat=1&lng=2&name=x&name=y'],
    ['未対応 v', '?v=2&lat=1&lng=2&name=x'],
    ['z 範囲外', '?lat=1&lng=2&name=x&z=3'],
    ['z 数値でない', '?lat=1&lng=2&name=x&z=big'],
  ])('%s はエラー', (_label, q) => {
    expect(parsePlaceParams(q).kind).toBe('error');
  });

  it('100文字ちょうど（絵文字はコードポイント1文字）はOK', () => {
    const name = '🍣'.repeat(100);
    const r = parsePlaceParams(`?lat=1&lng=2&name=${encodeURIComponent(name)}`);
    expect(r.kind).toBe('ok');
  });

  it('名称の前後空白は除去', () => {
    const r = parsePlaceParams('?lat=1&lng=2&name=%20%20hello%20');
    expect(r.kind === 'ok' && r.place.name).toBe('hello');
  });

  it('0 は正しい座標として扱う', () => {
    const r = parsePlaceParams('?lat=0&lng=0&name=Null%20Island');
    expect(r).toEqual({ kind: 'ok', place: { lat: 0, lng: 0, name: 'Null Island', zoom: 17 } });
  });
});

describe('Googleマップで開くリンク', () => {
  it('公式 Maps URLs 形式で確定座標を使う', () => {
    expect(googleMapsSearchUrl({ lat: -33.8568, lng: 151.2153 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=-33.856800%2C151.215300',
    );
  });
});
