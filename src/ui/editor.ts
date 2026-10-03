import type { Map as MlMap, Marker } from 'maplibre-gl';
import { classifyInput, parseCoordinateText, parseLongMapsUrl, type MapUrlResult } from '../lib/googleMaps';
import {
  DEFAULT_ZOOM,
  EVENT_MAX,
  MAX_MERCATOR_LAT,
  NAME_MAX,
  NOTE_MAX,
  buildShareUrl,
  charLength,
  formatCoord,
  googleMapsSearchUrl,
  validatePlace,
  type Place,
} from '../lib/place';
import { h, svg, toast } from './dom';
import { PIN_SVG } from './icons';
import { copyLink, shareLink } from './share';
import { mountViewer, type ViewerHandle } from './viewer';

type CoordKind = 'place' | 'viewport' | 'manual' | 'search';

const GEOCODER_URL: string =
  import.meta.env.VITE_GEOCODER_URL !== undefined
    ? (import.meta.env.VITE_GEOCODER_URL as string)
    : 'https://photon.komoot.io/api/';

const ZOOM_OPTIONS: [number, string][] = [
  [15, '広め（街区がわかる）'],
  [16, 'やや広め'],
  [17, '標準'],
  [18, '近め'],
  [19, 'かなり近め'],
];

const KIND_LABEL: Record<CoordKind, string> = {
  place: 'Googleマップの施設位置',
  viewport: 'Googleマップの表示中心（要確認）',
  manual: '地図で指定',
  search: '検索候補から選択（要確認）',
};

export function mountEditor(root: HTMLElement): void {
  const state: { lat: number | null; lng: number | null; kind: CoordKind | null } = { lat: null, lng: null, kind: null };
  let map: MlMap | null = null;
  let marker: Marker | null = null;
  let markerShown = false;
  let preview: ViewerHandle | null = null;

  // ---------- 1. 取り込み ----------
  const urlInput = h('textarea', {
    id: 'gm-url',
    rows: 2,
    placeholder: 'https://maps.app.goo.gl/…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-describedby': 'gm-url-hint',
  });
  const importBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void doImport() }, '読み込む');
  const importResult = h('div', { class: 'import-result', hidden: true, 'aria-live': 'polite' });

  // ---------- 2. 確認・修正 ----------
  const nameInput = h('input', { id: 'place-name', type: 'text', placeholder: '例：○○ビル 1階入口', autocomplete: 'off', enterkeyhint: 'done' });
  const nameCount = h('span', { class: 'counter' }, `0/${NAME_MAX}`);
  const eventInput = h('input', { id: 'place-event', type: 'text', placeholder: '例：佐藤さん送別会／夏祭り（任意）', autocomplete: 'off', enterkeyhint: 'done' });
  const eventCount = h('span', { class: 'counter' }, `0/${EVENT_MAX}`);
  const noteInput = h('input', { id: 'place-note', type: 'text', placeholder: '例：北側入口／地下1階', autocomplete: 'off', enterkeyhint: 'done' });
  const noteCount = h('span', { class: 'counter' }, `0/${NOTE_MAX}`);

  const mapEl = h('div', { class: 'editor-map', role: 'application', 'aria-label': '位置調整用の地図' });
  const mapHint = h('div', { class: 'map-hint' }, '地図をタップしてピンを置く');
  const mapWrap = h('div', { class: 'editor-map-wrap' }, mapEl, mapHint);
  const coordText = h('span', { class: 'coord-text' }, '未設定');
  const coordKind = h('span', { class: 'coord-kind' });
  const coordCheck = h('a', { class: 'coord-check', target: '_blank', rel: 'noopener', hidden: true }, 'Googleマップで確認↗');

  const latlngInput = h('input', { type: 'text', inputmode: 'decimal', placeholder: '35.658581, 139.745433', autocomplete: 'off', 'aria-label': '緯度, 経度' });
  const latlngMsg = h('p', { class: 'field-msg', 'aria-live': 'polite' });
  const latlngBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: () => applyLatLng() }, '反映');

  const searchInput = h('input', { type: 'search', placeholder: '例：東京タワー', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': '地名・住所' });
  const searchBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: () => void doSearch() }, '探す');
  const searchList = h('ul', { class: 'search-results', 'aria-live': 'polite' });

  const zoomSelect = h(
    'select',
    { id: 'place-zoom' },
    ...ZOOM_OPTIONS.map(([z, label]) => h('option', { value: z, selected: z === DEFAULT_ZOOM }, `${label}（z${z}）`)),
  );

  // ---------- 3. 共有 ----------
  const formErrors = h('ul', { class: 'form-errors', 'aria-live': 'assertive', hidden: true });
  const previewBtn = h('button', { type: 'button', class: 'btn', onclick: () => openPreview() }, '▶ 演出をプレビュー');
  const buildBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => buildLink() }, '共有URLを作る');
  const resultUrl = h('input', { type: 'url', readonly: true, 'aria-label': '共有URL', onfocus: (e: Event) => (e.target as HTMLInputElement).select() });
  const resultBox = h('div', { class: 'result', hidden: true });

  const editor = h(
    'main',
    { class: 'editor' },
    h(
      'header',
      { class: 'hero' },
      h('div', { class: 'hero-globe', 'aria-hidden': 'true' }, '🌏', h('span', { class: 'hero-finger' }, '👉')),
      h('h1', {}, 'ゴージャス', h('span', { class: 'hero-sparkle', 'aria-hidden': 'true' }, '✨'), 'マップ'),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, h('span', { class: 'step' }, '1'), 'Googleマップから取り込む'),
      h('p', { class: 'hint', id: 'gm-url-hint' }, 'Googleマップで場所を開いて「共有」→「リンクをコピー」したURLを貼ってください。取り込まずに下で直接指定してもOK。'),
      h('div', { class: 'row' }, urlInput, importBtn),
      importResult,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, h('span', { class: 'step' }, '2'), '場所を確認・修正'),
      h('label', { class: 'field', for: 'place-name' }, h('span', { class: 'label' }, '場所名', h('em', {}, '必須')), nameInput, nameCount),
      h('label', { class: 'field', for: 'place-event' }, h('span', { class: 'label' }, 'イベント名', h('small', { class: 'opt' }, '任意')), eventInput, eventCount),
      h('label', { class: 'field', for: 'place-note' }, h('span', { class: 'label' }, '補足', h('small', { class: 'opt' }, '任意')), noteInput, noteCount),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'ピンの位置', h('em', {}, '必須')), h('p', { class: 'hint' }, '地図をタップするか、ピンをドラッグして入口などに合わせてください。'), mapWrap),
      h('p', { class: 'coords' }, coordText, ' ', coordKind, ' ', coordCheck),
      h(
        'details',
        { class: 'more' },
        h('summary', {}, '地名・住所で探す'),
        h('div', { class: 'row' }, searchInput, searchBtn),
        h('p', { class: 'hint' }, '候補を選ぶとピンが移動します。位置は必ず地図で確認してください。'),
        searchList,
      ),
      h(
        'details',
        { class: 'more' },
        h('summary', {}, '緯度・経度を直接入力'),
        h('div', { class: 'row' }, latlngInput, latlngBtn),
        latlngMsg,
      ),
      h('label', { class: 'field', for: 'place-zoom' }, h('span', { class: 'label' }, '到着時の寄り具合'), zoomSelect),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, h('span', { class: 'step' }, '3'), '演出を確認して共有'),
      formErrors,
      h('div', { class: 'row row-buttons' }, previewBtn, buildBtn),
      h('p', { class: 'privacy' }, '🔒 共有リンクには場所名・補足・座標が含まれ、リンクを知っている人は誰でも見られます。'),
      resultBox,
    ),
    h(
      'footer',
      { class: 'editor-footer' },
      h('p', {}, '登録・ログイン不要。地点はURLの中にだけ入っていて、サーバーには保存されません。'),
    ),
  );
  root.append(editor);

  // ---------- 入力の変化 ----------
  const invalidate = () => {
    resultBox.hidden = true;
    formErrors.hidden = true;
  };
  const updateCounters = () => {
    const n = charLength(nameInput.value.trim());
    nameCount.textContent = `${n}/${NAME_MAX}`;
    nameCount.classList.toggle('over', n > NAME_MAX);
    const ev = charLength(eventInput.value.trim());
    eventCount.textContent = `${ev}/${EVENT_MAX}`;
    eventCount.classList.toggle('over', ev > EVENT_MAX);
    const m = charLength(noteInput.value.trim());
    noteCount.textContent = `${m}/${NOTE_MAX}`;
    noteCount.classList.toggle('over', m > NOTE_MAX);
  };
  for (const el of [nameInput, eventInput, noteInput]) {
    el.addEventListener('input', () => {
      updateCounters();
      invalidate();
    });
  }
  zoomSelect.addEventListener('change', invalidate);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void doImport();
    }
  });
  latlngInput.addEventListener('keydown', (e) => e.key === 'Enter' && applyLatLng());
  searchInput.addEventListener('keydown', (e) => e.key === 'Enter' && void doSearch());

  // ---------- ピン ----------
  function setPin(lat: number, lng: number, kind: CoordKind, opts: { fly?: boolean } = {}) {
    state.lat = lat;
    state.lng = lng;
    state.kind = kind;
    coordText.textContent = `${formatCoord(lat)}, ${formatCoord(lng)}`;
    coordKind.textContent = `（${KIND_LABEL[kind]}）`;
    coordKind.dataset.kind = kind;
    coordCheck.hidden = false;
    coordCheck.setAttribute('href', googleMapsSearchUrl({ lat, lng }));
    mapHint.hidden = true;
    invalidate();
    if (map && marker) {
      marker.setLngLat([lng, lat]);
      if (!markerShown) {
        marker.addTo(map);
        markerShown = true;
      }
      if (opts.fly !== false && Math.abs(lat) <= MAX_MERCATOR_LAT) {
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 17), duration: 900 });
      }
    }
  }

  // ---------- 地図 ----------
  void (async () => {
    const mod = await import('../map/mapSetup').catch(() => null);
    if (!mod || !mod.webglSupported()) {
      mapUnavailable('この端末では地図を表示できません。「緯度・経度を直接入力」から指定してください。');
      return;
    }
    let style;
    try {
      style = await mod.loadStyle();
    } catch {
      mapUnavailable('地図を読み込めませんでした。「緯度・経度を直接入力」から指定できます。');
      return;
    }
    const { maplibregl } = mod;
    const m = new maplibregl.Map({
      container: mapEl,
      style,
      center: state.lat !== null ? [state.lng!, state.lat] : [137.5, 37.2],
      zoom: state.lat !== null ? 17 : 3.6,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      cooperativeGestures: false,
    });
    m.touchZoomRotate.disableRotation();
    mod.installPoiIcons(m);
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const el = h('div', { class: 'pin editor-pin' }, h('div', { class: 'pin-inner' }, svg(PIN_SVG)));
    const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true });
    marker = mk;
    mk.on('dragend', () => {
      const ll = mk.getLngLat().wrap();
      setPin(ll.lat, ll.lng, 'manual', { fly: false });
    });
    if (state.lat !== null) {
      mk.setLngLat([state.lng!, state.lat]).addTo(m);
      markerShown = true;
    }
    m.on('click', (e) => {
      const ll = e.lngLat.wrap();
      setPin(ll.lat, ll.lng, 'manual', { fly: false });
    });
    map = m;
  })();

  function mapUnavailable(message: string) {
    mapWrap.classList.add('unavailable');
    mapHint.hidden = false;
    mapHint.textContent = message;
    mapWrap.parentElement?.parentElement?.querySelectorAll('details')[1]?.setAttribute('open', '');
  }

  // ---------- URL取り込み ----------
  async function doImport() {
    const text = urlInput.value;
    const c = classifyInput(text);
    if (c.kind === 'invalid') {
      showImportResult(null, c.message, 'error');
      return;
    }
    let result: MapUrlResult;
    if (c.kind === 'long') {
      result = { ...parseLongMapsUrl(c.url), source: 'long' };
    } else {
      importBtn.disabled = true;
      importBtn.textContent = '読み込み中…';
      try {
        result = await resolveShortUrl(c.url.href);
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = '読み込む';
      }
    }
    applyImport(result, c.hintLines);
  }

  function applyImport(r: MapUrlResult, hintLines: string[]) {
    let nameFrom: string | null = null;
    if (r.name) {
      nameInput.value = r.name;
      nameFrom = 'URL';
    } else if (hintLines[0] && !nameInput.value.trim() && r.status !== 'unsupported') {
      // 共有テキストの1行目（Googleマップアプリは施設名を入れてくる）
      nameInput.value = Array.from(hintLines[0]).slice(0, NAME_MAX).join('');
      nameFrom = '貼り付けたテキスト';
    }
    updateCounters();
    if (r.lat !== null && r.lng !== null) {
      setPin(r.lat, r.lng, r.coordinateKind === 'place' ? 'place' : 'viewport');
    }
    invalidate();
    const tone = r.status === 'resolved' ? 'ok' : r.status === 'partial' ? 'warn' : 'error';
    showImportResult(r, r.message, tone, nameFrom);
  }

  function showImportResult(
    r: MapUrlResult | null,
    message: string,
    tone: 'ok' | 'warn' | 'error',
    nameFrom: string | null = null,
  ) {
    importResult.hidden = false;
    importResult.dataset.tone = tone;
    const items: HTMLElement[] = [];
    if (r) {
      const src = r.source === 'short' ? '短縮URLを展開して解析' : '長いURLを解析';
      const coord =
        r.coordinateKind === 'place' ? '✅ 施設の位置' : r.coordinateKind === 'viewport' ? '⚠️ 表示中心のみ' : '❌ 取得できず';
      const name = r.name ? '✅ 取得' : nameFrom ? `✅ ${nameFrom}から` : '❌ 取得できず';
      items.push(
        h(
          'dl',
          { class: 'import-facts' },
          h('dt', {}, '方法'),
          h('dd', {}, src),
          h('dt', {}, '座標'),
          h('dd', {}, coord),
          h('dt', {}, '場所名'),
          h('dd', {}, name),
        ),
      );
    }
    importResult.replaceChildren(h('p', { class: 'import-msg' }, message), ...items);
  }

  async function resolveShortUrl(url: string): Promise<MapUrlResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch('./api/resolve-map-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: ctrl.signal,
      });
      const body = (await res.json().catch(() => null)) as MapUrlResult | null;
      if (body && typeof body.status === 'string') return { ...body, source: 'short' };
      throw new Error(`HTTP ${res.status}`);
    } catch {
      return {
        status: 'unsupported',
        lat: null,
        lng: null,
        name: null,
        coordinateKind: 'unknown',
        source: 'short',
        message:
          '短縮URLの展開サービスに接続できませんでした。Googleマップで場所を開いてアドレスバーの長いURLを貼るか、下で直接指定してください。',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- 座標の直接入力 ----------
  function applyLatLng() {
    const c = parseCoordinateText(latlngInput.value);
    if (!c) {
      latlngMsg.textContent = '「35.658581, 139.745433」のように 緯度, 経度 の順で入力してください。';
      latlngMsg.dataset.tone = 'error';
      return;
    }
    if (Math.abs(c.lat) > MAX_MERCATOR_LAT) {
      latlngMsg.textContent = `緯度 ±${MAX_MERCATOR_LAT.toFixed(2)} 度を超える地点（極地）は表示できません。`;
      latlngMsg.dataset.tone = 'error';
      return;
    }
    latlngMsg.textContent = '反映しました。';
    latlngMsg.dataset.tone = 'ok';
    setPin(c.lat, c.lng, 'manual');
  }

  // ---------- 地名検索（任意・候補から選ぶだけ） ----------
  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    if (!GEOCODER_URL) {
      searchList.replaceChildren(h('li', { class: 'muted' }, '検索は無効になっています。'));
      return;
    }
    searchBtn.disabled = true;
    searchList.replaceChildren(h('li', { class: 'muted' }, '検索中…'));
    try {
      const u = new URL(GEOCODER_URL, window.location.href);
      u.searchParams.set('q', q);
      u.searchParams.set('limit', '6');
      if (map) {
        const c = map.getCenter();
        u.searchParams.set('lat', c.lat.toFixed(4));
        u.searchParams.set('lon', c.lng.toFixed(4));
      }
      const res = await fetch(u, { headers: { accept: 'application/json' } });
      const data = (await res.json()) as { features?: GeoFeature[] };
      const feats = (data.features ?? []).filter((f) => f.geometry?.type === 'Point');
      if (!feats.length) {
        searchList.replaceChildren(h('li', { class: 'muted' }, '見つかりませんでした。地図で直接指定してください。'));
        return;
      }
      searchList.replaceChildren(
        ...feats.map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties ?? {};
          const title = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || '名称なし';
          const sub = [p.city, p.state, p.country].filter(Boolean).join(' / ');
          return h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'search-hit',
                onclick: () => {
                  setPin(lat, lng, 'search');
                  if (!nameInput.value.trim() && p.name) {
                    nameInput.value = p.name;
                    updateCounters();
                  }
                  searchList.replaceChildren();
                  toast('候補の位置にピンを置きました。位置を確認してください');
                },
              },
              h('strong', {}, title),
              h('span', {}, sub),
            ),
          );
        }),
      );
    } catch {
      searchList.replaceChildren(h('li', { class: 'muted' }, '検索できませんでした。地図で直接指定してください。'));
    } finally {
      searchBtn.disabled = false;
    }
  }

  // ---------- 検証・プレビュー・共有 ----------
  function currentPlace(): Place | null {
    const errors: string[] = [];
    if (state.lat === null || state.lng === null) errors.push('地図をタップしてピンを置いてください。');
    const res = validatePlace({
      lat: state.lat ?? 0,
      lng: state.lng ?? 0,
      name: nameInput.value,
      event: eventInput.value,
      note: noteInput.value,
      zoom: Number(zoomSelect.value),
    });
    if (!res.ok) errors.push(...res.errors);
    if (errors.length) {
      formErrors.hidden = false;
      formErrors.replaceChildren(...errors.map((e) => h('li', {}, e)));
      formErrors.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    formErrors.hidden = true;
    return res.ok ? res.place : null;
  }

  function openPreview() {
    const place = currentPlace();
    if (!place) return;
    preview?.destroy();
    const overlay = h('div', { class: 'preview-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'プレビュー' });
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    preview = mountViewer(overlay, place, {
      mode: 'preview',
      shareUrl: buildShareUrl(window.location.href, place),
      onClose: () => {
        preview?.destroy();
        preview = null;
        overlay.remove();
        document.body.classList.remove('no-scroll');
        previewBtn.focus();
      },
    });
  }

  function buildLink() {
    const place = currentPlace();
    if (!place) return;
    const url = buildShareUrl(window.location.href, place);
    resultUrl.value = url;
    resultBox.replaceChildren(
      h('p', { class: 'result-title' }, '🎉 共有URLができました'),
      resultUrl,
      h(
        'div',
        { class: 'row row-buttons' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void shareLink(place, url) }, '共有する'),
        h('button', { type: 'button', class: 'btn', onclick: () => void copyLink(url) }, 'コピー'),
        h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, '開いてみる'),
      ),
    );
    resultBox.hidden = false;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

interface GeoFeature {
  geometry: { type: string; coordinates: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}
