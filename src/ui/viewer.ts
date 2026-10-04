import type { Map as MlMap, Marker } from 'maplibre-gl';
import { charLength, formatCoord, googleMapsSearchUrl, type Place } from '../lib/place';
import { SHOW } from '../show/config';
import { Show, type Phase } from '../show/show';
import { h, prefersReducedMotion, svg } from './dom';
import { ShowSound } from '../show/sound';
import { FINGER_SVG, GLOBE_SPINNER_SVG, PIN_SVG, POKE_SVG, PROGRESS_RING_SVG } from './icons';
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
/** 先読みの見込みに持たせる余裕（必要時刻の何割までに読み終わる見込みなら開始するか） */
const PREFETCH_MARGIN = 0.6;
/** 回線が極端に遅いときでも、これ以上は待たずに始める */
const PREFETCH_MAX_WAIT_MS = 12000;
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
  const fx = h('div', { class: 'fx-layer' }, poke, finger, callFirst, callSecond);
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
  // 既定は音あり。ただしブラウザの自動再生制限で、操作前は鳴らせないことが多い。
  // その場合は画面のどこかを最初にタップ（またはキー入力）した瞬間から、演出の途中でも鳴らし始める。
  // 一度「音を消す」にした端末では鳴らさない。
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
    soundOn = ok && pref !== 'off';
    renderSoundBtn();
    show?.syncSound();
  });
  const unlockOnFirstGesture = (e: Event) => {
    // 音ボタン自体の操作は toggleSound に任せる（二重に切り替わらないように）
    if (soundOn || readSoundPref() === 'off' || soundBtn.contains(e.target as Node)) return;
    void sound.unlock().then((ok) => {
      if (!alive || !ok || soundOn) return;
      soundOn = true;
      renderSoundBtn();
      show?.syncSound();
    });
  };
  const gestureEvents = ['pointerdown', 'touchend', 'keydown'] as const;
  for (const ev of gestureEvents) document.addEventListener(ev, unlockOnFirstGesture, { capture: true });
  cleanups.push(() => {
    for (const ev of gestureEvents) document.removeEventListener(ev, unlockOnFirstGesture, { capture: true });
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
    h(
      'div',
      { class: 'loading-ring', role: 'progressbar', 'aria-label': '読み込み中', 'aria-valuemin': '0', 'aria-valuemax': '100' },
      svg(PROGRESS_RING_SVG),
      h('div', { class: 'loading-globe' }, svg(GLOBE_SPINNER_SVG)),
    ),
    h('div', { class: 'loading-text' }, 'loading...'),
    h('div', { class: 'loading-pct' }, '0%'),
  );
  const closeBtn =
    opts.mode === 'preview'
      ? h('button', { type: 'button', class: 'preview-close', onclick: () => opts.onClose?.() }, '✕ プレビューを閉じる')
      : null;

  // イベント名は最初から最後まで上部タイトルとして出しておく
  const eventTitle = place.event
    ? h('header', { class: 'event-title' }, h('div', { class: 'ribbon-wrap' }, h('div', { class: 'ribbon' }, h('span', { class: 'ribbon-spark', 'aria-hidden': 'true' }, '✦'), h('span', { class: 'event-title-icon', 'aria-hidden': 'true' }, '🥳'), h('h1', {}, place.event), h('span', { class: 'ribbon-spark', 'aria-hidden': 'true' }, '✦'))))
    : null;

  // ---- 読み込みの進み具合（段階ごとの目安。次の段階の手前までは少しずつ進める）----
  const ringEl = loading.querySelector<HTMLElement>('.loading-ring')!;
  const ringFg = loading.querySelector<SVGCircleElement>('.ring-fg')!;
  const pctEl = loading.querySelector<HTMLElement>('.loading-pct')!;
  const RING_LEN = 2 * Math.PI * 44;
  let shown = 0;
  let target = 0;
  let ceiling = 0.12;
  const setProgress = (value: number, next = value) => {
    target = Math.max(target, value);
    ceiling = Math.max(ceiling, next);
  };
  const progressTimer = window.setInterval(() => {
    target += (ceiling - target) * 0.025;
    shown += (target - shown) * 0.3;
    const pct = Math.min(100, Math.round(shown * 100));
    ringFg.style.strokeDashoffset = String(RING_LEN * (1 - shown));
    pctEl.textContent = `${pct}%`;
    ringEl.setAttribute('aria-valuenow', String(pct));
  }, 50);
  ringFg.style.strokeDasharray = String(RING_LEN);
  ringFg.style.strokeDashoffset = String(RING_LEN);
  const stopProgress = () => clearInterval(progressTimer);
  cleanups.push(stopProgress);

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
    stopProgress();
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

    setProgress(0.04, 0.15);
    const mod = await import('../map/mapSetup').catch(() => null);
    if (!alive) return;
    setProgress(0.15, 0.3);
    performance.mark('gm:module');
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
    setProgress(0.3, 0.6);
    performance.mark('gm:style');

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
        // 一気に寄るときに通り過ぎる倍率のタイル要求は捨て、最終画面のタイルを先に読む
        cancelPendingTileRequestsWhileZooming: true,
        // 読み込んだタイルを演出中に捨てないよう、キャッシュを大きめに
        maxTileCacheSize: 1200,
        maxTileCacheZoomLevels: 20,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      return showFallback('地図を初期化できませんでした。');
    }
    map = m;
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
    mod.installPoiIcons(m);
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
    // 後で必要になるタイル（ズーム各段・最終画面）は裏で読み込み始め、演出開始後も読み続ける。
    // 演出の前半（「そぉ～れ」→ 回転 →「ここぉ！」）は時間が決まっていて地球しか映らないので、
    // その間に読み終わる見込みの分だけ、開始前に待つ量を減らせる。
    const st = SHOW.stages;
    const prefetcherReady = mod.resolveTileTemplates(style).then((templates) => {
      const around = (zoom: number, r: number) => mod.tileUrlsAround(templates, place.lng, place.lat, zoom, r);
      const finalUrls = [...around(place.zoom, 1), ...mod.glyphUrls(style)];
      // 最後の段で通過する中間の倍率（z12・z13）も、最終画面の後に取っておく
      const passUrls = [...around(13, 0.5), ...around(12, 0.5)];
      const groups = reduced
        ? [{ urls: finalUrls, needAtMs: 0 }] // 軽減モーションは最初から最終画面
        : [
            { urls: around(st[0].zoom ?? 4.6, 0.5), needAtMs: st[0].start + st[0].move * 0.3 },
            { urls: around(st[1].zoom ?? 10.2, 0.5), needAtMs: st[1].start + st[1].move * 0.3 },
            { urls: finalUrls, needAtMs: st[2].start + st[2].move * 0.5 },
            { urls: passUrls, needAtMs: st[2].start + st[2].move * 0.5 },
          ];
      // 地球の初期表示が読み終わるまでは控えめに（2本）、その後は 6 本で取る
      const p = new mod.TilePrefetcher(groups, 2);
      p.start();
      void loaded.then(() => p.setConcurrency(6));
      cleanups.push(() => p.stop());
      return p;
    });

    void loaded.then(() => performance.mark('gm:map-load'));
    const [ok, , prefetcher] = await Promise.all([loaded, fontsReady, prefetcherReady]);
    performance.mark('gm:blocking-done');
    if (!alive) return;
    if (!ok) return showFallback('地図を読み込めませんでした。通信状況を確認してください。');
    setProgress(0.6, 0.7);

    // 「必要になる時刻までに読み終わる見込み」が立つまで待つ（ここが 60%→100%）
    const waitStart = performance.now();
    for (;;) {
      const s = prefetcher.status(PREFETCH_MARGIN);
      setProgress(0.6 + 0.4 * s.fraction, 0.6 + 0.4 * Math.min(0.99, s.fraction + 0.15));
      if (s.ready || performance.now() - waitStart > PREFETCH_MAX_WAIT_MS) {
        performance.mark('gm:prefetch-ready');
        break;
      }
      await new Promise((r) => setTimeout(r, 80));
      if (!alive) return;
    }

    // 100% を一瞬見せてから始める
    setProgress(1, 1);
    await new Promise((r) => setTimeout(r, 120));
    if (!alive) return;
    stopProgress();
    loading.remove();
    show = new Show(
      m,
      { stage, canvas, bgCanvas, fxCanvas, finger, callFirst, callSecond, poke, pin: pinInner, ring, card, actions, skip: skipBtn },
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
