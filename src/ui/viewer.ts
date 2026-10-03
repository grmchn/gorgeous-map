import type { Map as MlMap, Marker } from 'maplibre-gl';
import { charLength, formatCoord, googleMapsSearchUrl, type Place } from '../lib/place';
import { SHOW } from '../show/config';
import { Show, type Phase } from '../show/show';
import { h, prefersReducedMotion, svg } from './dom';
import { ShowSound } from '../show/sound';
import { BURST_SVG, FINGER_SVG, GLOBE_SPINNER_SVG, PIN_SVG, POKE_SVG } from './icons';
import { copyLink, shareLink } from './share';

export interface ViewerOptions {
  mode: 'share' | 'preview';
  /** 共有・コピーで使うURL（preview では使わない） */
  shareUrl: string;
  onClose?: () => void;
}

export interface ViewerHandle {
  destroy(): void;
  /** テスト・デバッグ用 */
  readonly phase: Phase;
}

const LOAD_TIMEOUT_MS = 12000;
const SLOW_NOTICE_MS = 6000;

export function nameSizeClass(name: string): string {
  const n = charLength(name);
  if (n <= 8) return 'name-xl';
  if (n <= 16) return 'name-l';
  if (n <= 32) return 'name-m';
  return 'name-s';
}

export function mountViewer(root: HTMLElement, place: Place, opts: ViewerOptions): ViewerHandle {
  let alive = true;
  let show: Show | null = null;
  let map: MlMap | null = null;
  let marker: Marker | null = null;
  let phase: Phase = 'loading';
  const cleanups: (() => void)[] = [];
  const reduced = prefersReducedMotion();

  // ---- DOM ----
  const mapEl = h('div', { class: 'viewer-map', 'aria-label': `${place.name} の地図`, role: 'region' });
  const canvas = h('canvas', { class: 'speedlines', 'aria-hidden': 'true' });
  const bgCanvas = h('canvas', { class: 'fx-canvas', 'aria-hidden': 'true' });
  const fxCanvas = h('canvas', { class: 'fx-canvas', 'aria-hidden': 'true' });
  const finger = h('div', { class: 'finger', 'aria-hidden': 'true' }, svg(FINGER_SVG));
  const callFirst = h('div', { class: 'bubble bubble-first', 'aria-hidden': 'true' }, SHOW.lines.first);
  const callSecond = h('div', { class: 'bubble bubble-second', 'aria-hidden': 'true' }, SHOW.lines.second);
  const poke = h('div', { class: 'poke', 'aria-hidden': 'true' }, svg(POKE_SVG));
  const sfx = SHOW.stages.map((s) => h('div', { class: 'sfx', 'aria-hidden': 'true' }, s.sfx));
  const babaan = h('div', { class: 'sfx sfx-babaan', 'aria-hidden': 'true' }, svg(BURST_SVG), h('span', {}, 'ババーン！'));
  const fx = h('div', { class: 'fx-layer' }, ...sfx, poke, finger, callFirst, callSecond, babaan);
  const stage = h('div', { class: 'stage' }, bgCanvas, mapEl, canvas, fxCanvas, fx);

  const pinInner = h('div', { class: 'pin-inner' }, svg(PIN_SVG));
  const ring = h('div', { class: 'pin-ring', 'aria-hidden': 'true' });
  const pinWrap = h('div', { class: 'pin', 'aria-label': place.name }, ring, pinInner);

  const card = h(
    'div',
    { class: 'name-card', role: 'heading', 'aria-level': place.event ? '2' : '1' },
    h('div', { class: 'name-kicker' }, `${SHOW.lines.first}…${SHOW.lines.second}`),
    h('div', { class: `place-name ${nameSizeClass(place.name)}` }, place.name),
    place.note ? h('div', { class: 'place-note' }, place.note) : null,
  );

  const gmapsUrl = googleMapsSearchUrl(place);
  const replayBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => replay() }, '↻ もう一度');
  const actions =
    opts.mode === 'share'
      ? h(
          'div',
          { class: 'actions' },
          h(
            'div',
            { class: 'actions-row' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void shareLink(place, opts.shareUrl) }, '共有する'),
            h('button', { type: 'button', class: 'btn', onclick: () => void copyLink(opts.shareUrl) }, 'URLコピー'),
          ),
          h(
            'div',
            { class: 'actions-row' },
            h('a', { class: 'btn', href: gmapsUrl, target: '_blank', rel: 'noopener' }, 'Googleマップで開く'),
            replayBtn,
          ),
          h('a', { class: 'make-own', href: './' }, '＋ 自分の場所を作る'),
        )
      : h(
          'div',
          { class: 'actions' },
          h(
            'div',
            { class: 'actions-row' },
            replayBtn,
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => opts.onClose?.() }, '編集に戻る'),
          ),
        );

  const sheet = h('section', { class: 'sheet', 'aria-live': 'polite' }, card, actions);
  const skipBtn = h('button', { type: 'button', class: 'skip', hidden: true, onclick: () => show?.skip() }, 'スキップ ▶▶');

  // ---- 音（BGM・効果音）----
  // 自動再生制限があるので、共有リンクでは無音で始めて「音を出す」ボタンで鳴らす。
  // プレビューはボタン操作の直後なので最初から鳴らせる。
  const sound = new ShowSound();
  const pref = readSoundPref();
  let soundOn = false;
  const soundBtn = h('button', { type: 'button', class: 'sound-btn', onclick: () => void toggleSound() });
  const renderSoundBtn = () => {
    soundBtn.textContent = soundOn ? '🔊' : '🔇 音を出す';
    soundBtn.setAttribute('aria-label', soundOn ? '音を消す' : '音を出す');
    soundBtn.classList.toggle('off', !soundOn);
  };
  async function toggleSound() {
    if (soundOn) {
      soundOn = false;
      writeSoundPref('off');
    } else {
      soundOn = await sound.unlock();
      if (soundOn) writeSoundPref('on');
    }
    renderSoundBtn();
    show?.syncSound();
  }
  renderSoundBtn();
  void sound.unlock().then((ok) => {
    if (!alive) return;
    soundOn = ok && (opts.mode === 'preview' ? pref !== 'off' : pref === 'on');
    renderSoundBtn();
    show?.syncSound();
  });
  const controls = h('div', { class: 'show-controls' }, soundBtn, skipBtn);
  const recenterBtn = h(
    'button',
    { type: 'button', class: 'recenter', hidden: true, onclick: () => recenter() },
    '📍 ピンに戻る',
  );
  const loading = h(
    'div',
    { class: 'loading', role: 'status' },
    h('div', { class: 'loading-globe' }, svg(GLOBE_SPINNER_SVG)),
    h('div', { class: 'loading-text' }, '準備中…'),
  );
  const closeBtn =
    opts.mode === 'preview'
      ? h('button', { type: 'button', class: 'preview-close', onclick: () => opts.onClose?.() }, '✕ プレビューを閉じる')
      : null;

  // イベント名は最初から最後まで上部タイトルとして出しておく
  const eventTitle = place.event
    ? h('header', { class: 'event-title' }, h('span', { class: 'event-title-icon', 'aria-hidden': 'true' }, '🎉'), h('h1', {}, place.event))
    : null;

  const viewer = h('div', { class: 'viewer', 'data-phase': 'loading' }, stage, loading, eventTitle, sheet, controls, recenterBtn, closeBtn);
  root.append(viewer);

  // 演出前は結果UIを隠しておく
  card.style.visibility = 'hidden';
  actions.style.opacity = '0';
  actions.setAttribute('inert', '');

  const setPhase = (p: Phase) => {
    phase = p;
    viewer.dataset.phase = p;
    if (p === 'settled') updateRecenter();
  };

  const getTopInset = () => (eventTitle ? eventTitle.offsetTop + eventTitle.offsetHeight + 10 : 12);

  const getPadding = () => {
    const top = Math.max(Math.min(80, viewer.clientHeight * 0.1), getTopInset());
    // 横長の低い画面ではシートを右側に置く（CSS）。そのときは右側を空ける。
    const side = sheet.offsetWidth < viewer.clientWidth * 0.7;
    return side
      ? { top: eventTitle ? top : top * 0.5, bottom: 0, left: 0, right: sheet.offsetWidth }
      : { top, bottom: sheet.offsetHeight + 8, left: 0, right: 0 };
  };

  function replay() {
    if (!show) return;
    recenterBtn.hidden = true;
    show.play();
  }

  function recenter() {
    map?.easeTo({ center: [place.lng, place.lat], zoom: place.zoom, bearing: 0, pitch: 0, padding: getPadding(), duration: 600 });
  }

  function updateRecenter() {
    if (!map || phase !== 'settled') {
      recenterBtn.hidden = true;
      return;
    }
    const p = map.project([place.lng, place.lat]);
    const r = mapEl.getBoundingClientRect();
    const off = p.x < 0 || p.y < 0 || p.x > r.width || p.y > r.height - getPadding().bottom || Math.abs(map.getZoom() - place.zoom) > 2.5;
    recenterBtn.hidden = !off;
  }

  /** 地図が使えないときの結果表示（場所の情報には必ずたどり着けるようにする） */
  function showFallback(reason: string) {
    if (!alive) return;
    show?.destroy();
    show = null;
    try {
      map?.remove();
    } catch {
      /* ignore */
    }
    map = null;
    viewer.classList.add('fallback');
    loading.remove();
    skipBtn.hidden = true;
    stage.replaceChildren(
      h(
        'div',
        { class: 'fallback-body' },
        h('div', { class: 'fallback-globe', 'aria-hidden': 'true' }, svg(GLOBE_SPINNER_SVG)),
        h('p', { class: 'fallback-reason' }, reason),
        h('p', { class: 'fallback-coords' }, `緯度 ${formatCoord(place.lat)} / 経度 ${formatCoord(place.lng)}`),
      ),
    );
    card.style.visibility = 'visible';
    card.style.opacity = '1';
    card.style.transform = '';
    actions.style.opacity = '1';
    actions.style.transform = '';
    actions.style.pointerEvents = 'auto';
    actions.removeAttribute('inert');
    replayBtn.hidden = true;
    soundBtn.hidden = true;
    sound.stop();
    setPhase('settled');
  }

  // ---- 起動 ----
  void (async () => {
    const slowTimer = window.setTimeout(() => {
      if (!alive || phase !== 'loading') return;
      loading.append(
        h('div', { class: 'loading-slow' }, '地図の読み込みに時間がかかっています',
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => showFallback('地図なしで表示しています。') }, '地図なしで見る'),
        ),
      );
    }, SLOW_NOTICE_MS);
    cleanups.push(() => clearTimeout(slowTimer));

    const mod = await import('../map/mapSetup').catch(() => null);
    if (!alive) return;
    if (!mod) return showFallback('地図の部品を読み込めませんでした。通信状況を確認してください。');
    if (!mod.webglSupported()) {
      return showFallback('この端末・ブラウザでは地図（WebGL）を表示できません。');
    }

    let style;
    try {
      style = await mod.loadStyle();
    } catch {
      return showFallback('地図を読み込めませんでした。通信状況を確認してください。');
    }
    if (!alive) return;

    const { maplibregl } = mod;
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: mapEl,
        style: { ...style, projection: { type: 'globe' } },
        center: [place.lng, place.lat],
        zoom: 1,
        attributionControl: false,
        interactive: true,
        cancelPendingTileRequestsWhileZooming: false,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      return showFallback('地図を初期化できませんでした。');
    }
    map = m;
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
    for (const hdl of [m.dragPan, m.scrollZoom, m.boxZoom, m.doubleClickZoom, m.keyboard, m.touchZoomRotate]) hdl.disable();
    m.on('webglcontextlost', () => showFallback('地図の表示が中断されました。'));
    m.on('moveend', updateRecenter);

    marker = new maplibregl.Marker({ element: pinWrap, anchor: 'bottom' }).setLngLat([place.lng, place.lat]).addTo(m);
    pinInner.style.opacity = '0';

    const loaded = new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
      m.once('load', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    const fontsReady = Promise.race([
      document.fonts?.load('1em "Dela Gothic One"', `${SHOW.lines.first}${SHOW.lines.second}ズーン`).catch(() => undefined),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    const prefetch = reduced
      ? mod.prefetchTiles(style, place.lng, place.lat, [place.zoom], 2000)
      : mod.prefetchTiles(style, place.lng, place.lat, [SHOW.stages[0].zoom ?? 5, SHOW.stages[1].zoom ?? 10, place.zoom]);

    const [ok] = await Promise.all([loaded, fontsReady, prefetch]);
    if (!alive) return;
    if (!ok) return showFallback('地図を読み込めませんでした。通信状況を確認してください。');

    loading.remove();
    show = new Show(
      m,
      { stage, canvas, bgCanvas, fxCanvas, finger, callFirst, callSecond, poke, sfx, babaan, pin: pinInner, ring, card, actions, skip: skipBtn },
      place,
      { reducedMotion: reduced, getPadding, getTopInset, onPhase: setPhase, sound, soundOn: () => soundOn },
    );
    show.play();
    if (import.meta.env.DEV) (window as unknown as { __show?: Show }).__show = show;
  })();

  const onResize = () => {
    show?.handleResize();
    updateRecenter();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  const ro = new ResizeObserver(() => {
    viewer.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
    if (eventTitle) viewer.style.setProperty('--top-inset', `${getTopInset() - 6}px`);
    if (phase === 'settled') map?.setPadding(getPadding());
  });
  ro.observe(sheet);
  if (eventTitle) ro.observe(eventTitle);
  cleanups.push(() => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    ro.disconnect();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && phase !== 'settled') show?.skip();
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));

  return {
    destroy() {
      alive = false;
      show?.destroy();
      sound.dispose();
      cleanups.forEach((f) => f());
      marker?.remove();
      try {
        map?.remove();
      } catch {
        /* ignore */
      }
      viewer.remove();
    },
    get phase() {
      return phase;
    },
  };
}

const SOUND_KEY = 'gorgeous-map:sound';

/** 音のオン／オフはこの閲覧者の端末だけの好み。読めない環境（プライベートモード等）では未設定扱い */
function readSoundPref(): 'on' | 'off' | null {
  try {
    const v = localStorage.getItem(SOUND_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

function writeSoundPref(v: 'on' | 'off'): void {
  try {
    localStorage.setItem(SOUND_KEY, v);
  } catch {
    /* 保存できなくても動作には影響しない */
  }
}
