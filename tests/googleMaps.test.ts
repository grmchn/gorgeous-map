import { describe, expect, it } from 'vitest';
import {
  classifyInput,
  extractUrlFromText,
  parseCoordinateText,
  parseLongMapsUrl,
} from '../src/lib/googleMaps';

const parse = (s: string) => parseLongMapsUrl(new URL(s));

describe('長いGoogleマップURLの解析', () => {
  it('公式 api=1 の query=緯度,経度 は施設位置として採用', () => {
    const r = parse('https://www.google.com/maps/search/?api=1&query=47.5951518%2C-122.3316393');
    expect(r).toMatchObject({ status: 'resolved', lat: 47.5951518, lng: -122.3316393, coordinateKind: 'place', name: null });
  });

  it('旧形式 ?q=緯度,経度', () => {
    const r = parse('https://maps.google.com/?q=-33.8568,151.2153');
    expect(r).toMatchObject({ status: 'resolved', lat: -33.8568, lng: 151.2153, coordinateKind: 'place' });
  });

  it('?q=loc:緯度,経度 と ラベル付き', () => {
    expect(parse('https://maps.google.com/maps?q=loc:35.1,135.2')).toMatchObject({ lat: 35.1, lng: 135.2 });
    const r = parse('https://maps.google.com/maps?q=35.1,135.2+(%E9%9B%86%E5%90%88)');
    expect(r).toMatchObject({ lat: 35.1, lng: 135.2, name: '集合', status: 'resolved' });
  });

  it('施設URL: data=!3d!4d の施設座標を採用し、@ の表示中心と混同しない', () => {
    const r = parse(
      'https://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E3%82%BF%E3%83%AF%E3%83%BC/@35.6585805,139.7428578,17z/data=!3m1!4b1!4m6!3m5!1s0x60188bbd9009ec09:0x481a93f0d2a409dd!8m2!3d35.6585805!4d139.7454329!16zL20vMDFfOXJf?entry=ttu',
    );
    expect(r).toMatchObject({
      status: 'resolved',
      lat: 35.6585805,
      lng: 139.7454329,
      name: '東京タワー',
      coordinateKind: 'place',
    });
  });

  it('place 名の + は空白に戻す', () => {
    const r = parse('https://www.google.com/maps/place/Sydney+Opera+House/@-33.85,151.21,17z/data=!8m2!3d-33.8567844!4d151.213108');
    expect(r).toMatchObject({ name: 'Sydney Opera House', lat: -33.8567844, lng: 151.213108 });
  });

  it('place セグメントが座標（10進）', () => {
    const r = parse('https://www.google.com/maps/place/35.658581,139.745433/@35.658581,139.745433,17z');
    expect(r).toMatchObject({ status: 'resolved', lat: 35.658581, lng: 139.745433, coordinateKind: 'place', name: null });
  });

  it('place セグメントが座標（度分秒、南緯西経）', () => {
    const r = parse(
      "https://www.google.com/maps/place/22%C2%B057'06.9%22S+43%C2%B012'37.8%22W/@-22.95,-43.21,17z",
    );
    expect(r.status).toBe('resolved');
    expect(r.lat).toBeCloseTo(-22.951917, 5);
    expect(r.lng).toBeCloseTo(-43.2105, 4);
  });

  it('@lat,lng しか無い場合は表示中心（partial / viewport）', () => {
    const r = parse('https://www.google.com/maps/@35.6812,139.7671,15z');
    expect(r).toMatchObject({ status: 'partial', coordinateKind: 'viewport', lat: 35.6812, lng: 139.7671 });
  });

  it('api=1 map_action=map&center= は表示中心', () => {
    const r = parse('https://www.google.com/maps/@?api=1&map_action=map&center=-33.712206%2C150.311941&zoom=12');
    expect(r).toMatchObject({ status: 'partial', coordinateKind: 'viewport', lat: -33.712206 });
  });

  it('名前だけで座標が無い（ftid のみ）なら座標を捏造しない', () => {
    const r = parse(
      'https://www.google.com/maps/place/%E3%82%B9%E3%82%BF%E3%83%BC%E3%83%90%E3%83%83%E3%82%AF%E3%82%B9/data=!4m2!3m1!1s0x60188b:0x1234?utm_source=mstt_1',
    );
    expect(r).toMatchObject({ status: 'partial', lat: null, lng: null, name: 'スターバックス', coordinateKind: 'unknown' });
  });

  it('施設名＋表示中心だけなら viewport（施設位置と取り違えない）', () => {
    const r = parse('https://www.google.com/maps/place/Some+Cafe/@10.5,20.5,17z/data=!4m2!3m1!1s0x1:0x2');
    expect(r).toMatchObject({ status: 'partial', coordinateKind: 'viewport', name: 'Some Cafe', lat: 10.5, lng: 20.5 });
  });

  it('検索語（住所など）は座標として扱わない', () => {
    const r = parse('https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%A7%85');
    expect(r).toMatchObject({ status: 'partial', lat: null, lng: null, name: '東京駅' });
  });

  it('Place ID だけ', () => {
    const r = parse('https://www.google.com/maps/search/?api=1&query_place_id=ChIJ3S-JXmauEmsRUcIaWtf4MzE');
    expect(r).toMatchObject({ status: 'unsupported', lat: null, lng: null });
    expect(r.message).toContain('施設ID');
  });

  it('経路URLは非対応（勝手に一地点を選ばない）', () => {
    for (const u of [
      'https://www.google.com/maps/dir/35.1,135.1/35.2,135.2/data=!3d35.2!4d135.2',
      'https://www.google.com/maps/dir/?api=1&origin=a&destination=35.2,135.2',
      'https://maps.google.com/maps?saddr=a&daddr=b',
    ]) {
      expect(parse(u)).toMatchObject({ status: 'unsupported', lat: null, lng: null });
    }
  });

  it('data に異なる施設座標が複数あれば採用しない', () => {
    const r = parse('https://www.google.com/maps/place/x/data=!8m2!3d1!4d2!8m2!3d3!4d4');
    expect(r.coordinateKind).not.toBe('place');
  });

  it('範囲外の座標は採用しない', () => {
    const r = parse('https://maps.google.com/?q=95,10');
    expect(r.lat).toBeNull();
  });
});

describe('座標テキスト', () => {
  it.each([
    ['35.1, 135.2', 35.1, 135.2],
    ['-0.5,-179.9', -0.5, -179.9],
    ['35°39\'31.0"N 139°44\'43.0"E', 35.658611, 139.745278],
    ['139°44\'43.0"E 35°39\'31.0"N', 35.658611, 139.745278],
  ])('%s', (t, lat, lng) => {
    const r = parseCoordinateText(t)!;
    expect(r.lat).toBeCloseTo(lat, 5);
    expect(r.lng).toBeCloseTo(lng, 5);
  });

  it.each(['東京駅', '35.1', '35.1 135.2 999', '91,0'])('%s は座標ではない', (t) => {
    expect(parseCoordinateText(t)).toBeNull();
  });
});

describe('入力の分類', () => {
  it('共有テキストからURLを取り出し、残りを名前ヒントにする', () => {
    const r = extractUrlFromText('東京タワー\nhttps://maps.app.goo.gl/AbCdEf123');
    expect(r.url).toBe('https://maps.app.goo.gl/AbCdEf123');
    expect(r.otherLines).toEqual(['東京タワー']);
  });

  it('短縮URL / 長いURL / その他', () => {
    expect(classifyInput('https://maps.app.goo.gl/AbCdEf123').kind).toBe('short');
    expect(classifyInput('https://goo.gl/maps/AbCdEf123').kind).toBe('short');
    expect(classifyInput('https://www.google.co.jp/maps/@35,139,15z').kind).toBe('long');
    expect(classifyInput('https://maps.google.com/?q=1,2').kind).toBe('long');
    expect(classifyInput('https://example.com/maps/place/x').kind).toBe('invalid');
    expect(classifyInput('https://www.google.com/search?q=x').kind).toBe('invalid');
    expect(classifyInput('東京タワー').kind).toBe('invalid');
  });

  it('consent.google.com の continue を展開する', () => {
    const r = classifyInput(
      'https://consent.google.com/m?continue=https://www.google.com/maps/place/x/data%3D!8m2!3d1!4d2&gl=DE',
    );
    expect(r.kind).toBe('long');
  });
});
