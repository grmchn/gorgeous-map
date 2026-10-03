import type { Map as MlMap, PaddingOptions } from 'maplibre-gl';
import type { Place } from '../lib/place';
import { REDUCED, SHOW } from './config';
import {
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  progress,
  punch,
  shakeAt,
} from './easing';
import { SpeedLines } from './speedLines';

export type Phase = 'loading' | 'globe' | 'pointing' | 'pause' | 'zooming' | 'arrival' | 'settled';

export interface ShowElements {
  /** 揺らす対象（地図・集中線・指などをまとめた箱） */
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  finger: HTMLElement;
  bubble: HTMLElement;
  bubbleKoko: HTMLElement;
  sfx: HTMLElement[];
  /** 到着時の「ババーン！」 */
  babaan: HTMLElement;
  /** ピン（Marker の内側要素。落下アニメはこれを動かす） */
  pin: HTMLElement;
  ring: HTMLElement;
  card: HTMLElement;
  actions: HTMLElement;
  skip: HTMLElement;
}

export interface ShowOptions {
  reducedMotion: boolean;
  /** 結果画面で場所名カード等に隠れないための地図の余白 */
  getPadding: () => PaddingOptions;
  onPhase?: (phase: Phase) => void;
}

/** 指アイコンの指先位置（要素左上からのpx）と向き */
const FINGER_TIP = { x: 46, y: 6 };
const FINGER_ANGLE = -32;

/**
 * 演出の進行役。描画はすべて「経過時間 t の関数」として計算するので、
 * スキップは t を終端に飛ばすだけ、再生し直しは t=0 に戻すだけで済み、古い状態が残らない。
 */
export class Show {
  private raf = 0;
  private startAt = 0;
  private phase: Phase = 'loading';
  private lines: SpeedLines | null = null;
  private destroyed = false;
  private finalT: number;
  private zoomList: number[];
  /** 毎フレームのレイアウト読み取りを避けるため、サイズはまとめて測っておく */
  private sizes = {
    w: 0,
    h: 0,
    bubbleW: 220,
    bubbleH: 90,
    sfx: [] as { w: number; h: number }[],
    babaan: { w: 160, h: 60 },
    card: { left: 0, top: 0, right: 0, bottom: 0 },
  };

  constructor(
    private map: MlMap,
    private els: ShowElements,
    private place: Place,
    private opts: ShowOptions,
  ) {
    this.finalT = opts.reducedMotion ? REDUCED.end : SHOW.total;
    this.zoomList = SHOW.stages.map((s) => s.zoom ?? place.zoom);
    try {
      this.lines = new SpeedLines(els.canvas);
    } catch {
      this.lines = null;
    }
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** 最初から再生（再生中に呼んでも安全） */
  play(): void {
    if (this.destroyed) return;
    cancelAnimationFrame(this.raf);
    this.setInteractive(false);
    this.measure();
    this.startAt = performance.now();
    this.els.skip.hidden = false;
    const tick = () => {
      if (this.destroyed) return;
      const t = performance.now() - this.startAt;
      this.render(Math.min(t, this.finalT));
      if (t < this.finalT) this.raf = requestAnimationFrame(tick);
      else this.finish();
    };
    this.render(0);
    this.raf = requestAnimationFrame(tick);
  }

  /** どの状態からでも結果画面へ */
  skip(): void {
    if (this.destroyed || this.phase === 'settled') return;
    cancelAnimationFrame(this.raf);
    this.render(this.finalT);
    this.finish();
  }

  /** 開発用：指定時刻の1フレームを描いて止める */
  seek(t: number): void {
    cancelAnimationFrame(this.raf);
    this.render(Math.max(0, Math.min(t, this.finalT)));
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
  }

  /** サイズ変更・回転後に呼ぶ */
  handleResize(): void {
    this.measure();
    if (this.phase === 'settled') {
      this.map.easeTo({ padding: this.opts.getPadding(), duration: 0 });
    }
  }

  private measure(): void {
    this.lines?.resize();
    const r = this.els.stage.getBoundingClientRect();
    this.sizes.w = r.width;
    this.sizes.h = r.height;
    this.sizes.bubbleW = this.els.bubble.offsetWidth || 220;
    this.sizes.bubbleH = this.els.bubble.offsetHeight || 90;
    this.sizes.sfx = this.els.sfx.map((el) => ({ w: el.offsetWidth || 120, h: el.offsetHeight || 60 }));
    this.sizes.babaan = { w: this.els.babaan.offsetWidth || 160, h: this.els.babaan.offsetHeight || 60 };
    // カードは拡大縮小アニメ中でも、レイアウト上の位置は変わらない
    const prev = this.els.card.style.transform;
    this.els.card.style.transform = '';
    const cr = this.els.card.getBoundingClientRect();
    this.els.card.style.transform = prev;
    this.sizes.card = { left: cr.left - r.left, top: cr.top - r.top, right: cr.right - r.left, bottom: cr.bottom - r.top };
  }

  private finish(): void {
    this.setPhase('settled');
    this.els.skip.hidden = true;
    this.lines?.clear();
    this.els.stage.style.transform = '';
    this.setInteractive(true);
  }

  private setPhase(p: Phase): void {
    if (p === this.phase) return;
    this.phase = p;
    this.opts.onPhase?.(p);
  }

  private setInteractive(on: boolean): void {
    const m = this.map;
    const hs = [m.dragPan, m.scrollZoom, m.boxZoom, m.doubleClickZoom, m.keyboard, m.touchZoomRotate];
    for (const h of hs) {
      if (on) h.enable();
      else h.disable();
    }
    m.dragRotate.disable();
    m.touchPitch.disable();
    if (on) m.touchZoomRotate.disableRotation();
  }

  // ---------------------------------------------------------------------------
  // 1フレーム分の描画（t の純関数）
  // ---------------------------------------------------------------------------

  private render(t: number): void {
    if (this.opts.reducedMotion) return this.renderReduced(t);

    this.setPhase(phaseAt(t));
    const { lng, lat } = this.place;
    const z0 = this.globeZoom();
    const zoom = this.zoomAt(t, z0);
    const finalPad = this.opts.getPadding();
    const padK = easeInOutCubic(clamp01((zoom - z0) / (this.place.zoom - z0)));
    const intro = easeOutCubic(progress(t, SHOW.globeIn.start, SHOW.globeIn.end));

    this.map.jumpTo({
      center: [lng + SHOW.globeIn.spinDeg * (1 - intro), lat],
      zoom,
      bearing: this.bearingAt(t),
      pitch: 0,
      padding: scalePadding(finalPad, padK),
    });

    const p = this.map.project([lng, lat]);
    const { w, h } = this.sizes;

    this.renderFinger(t, p.x, p.y);
    this.renderBubble(t, p.x, p.y, w);
    this.renderSfx(t, p.x, p.y, w, h);
    this.renderSpeedLines(t, p.x, p.y);
    this.renderShake(t);
    this.renderPin(t);
    this.renderCard(t);
    this.renderBabaan(t);
    this.renderActions(t >= SHOW.settle.actionsIn ? progress(t, SHOW.settle.actionsIn, SHOW.settle.end) : 0);
  }

  private renderReduced(t: number): void {
    this.setPhase('arrival');
    this.map.jumpTo({
      center: [this.place.lng, this.place.lat],
      zoom: this.place.zoom,
      bearing: 0,
      pitch: 0,
      padding: this.opts.getPadding(),
    });
    hide(this.els.finger);
    hide(this.els.bubble);
    hide(this.els.babaan);
    this.els.sfx.forEach(hide);
    this.lines?.clear();
    this.els.pin.style.opacity = '1';
    this.els.pin.style.transform = '';
    this.els.ring.style.opacity = '0';
    const c = progress(t, 0, REDUCED.cardIn);
    this.els.card.style.opacity = String(c);
    this.els.card.style.transform = '';
    this.els.card.style.visibility = c > 0 ? 'visible' : 'hidden';
    this.renderActions(progress(t, REDUCED.actionsIn, REDUCED.end));
  }

  /** 画面短辺に対して地球がちょうどよい大きさになる倍率 */
  private globeZoom(): number {
    const d = Math.max(160, Math.min(this.sizes.w, this.sizes.h * 0.8)) * SHOW.globeDiameterRatio;
    // MapLibre の球体は中心緯度の縮尺をメルカトルに合わせるため、高緯度ほど大きく描かれる。その分を補正する。
    const latAdj = Math.log2(Math.max(0.05, Math.cos((this.place.lat * Math.PI) / 180)));
    return Math.log2((d * Math.PI) / 512) + latAdj;
  }

  private zoomAt(t: number, z0: number): number {
    if (t < SHOW.globeIn.end) {
      return z0 + SHOW.globeIn.zoomFrom * (1 - easeOutCubic(progress(t, SHOW.globeIn.start, SHOW.globeIn.end)));
    }
    let from = z0;
    for (let i = 0; i < SHOW.stages.length; i++) {
      const s = SHOW.stages[i];
      const to = Math.max(from, this.zoomList[i]);
      if (t < s.start) return from;
      if (t < s.start + s.move) return lerp(from, to, punch(progress(t, s.start, s.start + s.move)));
      from = to;
    }
    return this.place.zoom;
  }

  private bearingAt(t: number): number {
    for (const s of SHOW.stages) {
      if (!s.bearing) continue;
      const k = progress(t, s.start, s.start + s.move + s.hold);
      if (k > 0 && k < 1) return s.bearing * Math.sin(Math.PI * easeInOutCubic(k));
    }
    return 0;
  }

  private renderFinger(t: number, px: number, py: number): void {
    const el = this.els.finger;
    const { enter, arrive } = SHOW.finger;
    const exitStart = SHOW.stages[0].start;
    const exitEnd = exitStart + 220;
    if (t < enter || t >= exitEnd) return hide(el);
    let dx = 0;
    let dy = 0;
    let scale = 1;
    let opacity = 1;
    if (t < arrive) {
      const k = easeOutBack(progress(t, enter, arrive), 1.4);
      dx = (1 - k) * 260;
      dy = (1 - k) * 360;
      opacity = clamp01(progress(t, enter, enter + 60));
    } else if (t >= exitStart) {
      // 指が地図へ「ズブッ」と押し込まれるように縮んで消える
      const k = easeInCubic(progress(t, exitStart, exitEnd));
      scale = 1 - 0.55 * k;
      opacity = 1 - k;
    } else if (t >= SHOW.pause.start) {
      // タメ：ほんのわずかに押し込む（静止に見える程度）
      scale = 1 - 0.03 * easeOutCubic(progress(t, SHOW.pause.start, SHOW.pause.start + 200));
    }
    el.style.visibility = 'visible';
    el.style.opacity = String(opacity);
    el.style.transform = `translate(${px - FINGER_TIP.x + dx}px, ${py - FINGER_TIP.y + dy}px) rotate(${FINGER_ANGLE}deg) scale(${scale})`;
  }

  private renderBubble(t: number, px: number, py: number, w: number): void {
    const el = this.els.bubble;
    const { soure, koko, exit } = SHOW.bubble;
    if (t < soure || t >= exit) return hide(el);
    const { bubbleW: bw, bubbleH: bh } = this.sizes;
    // 指（右下から来る）と重ならないよう、地点の上に置く。画面外にはみ出さない。
    const x = Math.max(8, Math.min(w - bw - 8, px - bw * 0.42));
    const y = Math.max(8, py - bh - 54);
    let s = easeOutBack(progress(t, soure, soure + 140), 2.2);
    let opacity = 1;
    if (t >= SHOW.stages[0].start) {
      const k = progress(t, SHOW.stages[0].start, exit);
      s = 1 + 0.35 * k;
      opacity = 1 - easeInCubic(k);
    }
    el.style.visibility = 'visible';
    el.style.opacity = String(opacity);
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    el.style.setProperty('--tail-x', `${Math.max(24, Math.min(bw - 24, px - x))}px`);
    const kk = this.els.bubbleKoko;
    if (t < koko) {
      kk.style.opacity = '0';
      kk.style.transform = 'scale(0.2)';
    } else {
      kk.style.opacity = '1';
      kk.style.transform = `scale(${easeOutBack(progress(t, koko, koko + 160), 3)})`;
    }
  }

  private renderSfx(t: number, px: number, py: number, w: number, h: number): void {
    const placements = [
      { dx: -0.3, dy: -0.22, rot: -14, size: 1 },
      { dx: 0.26, dy: -0.18, rot: 11, size: 1.1 },
      { dx: 0, dy: -0.27, rot: -6, size: 1.35 },
    ];
    SHOW.stages.forEach((s, i) => {
      const el = this.els.sfx[i];
      if (!el) return;
      const a = s.start + s.move * 0.35;
      const b = s.start + s.move + s.hold + 160;
      if (t < a || t >= b) return hide(el);
      const pl = placements[i];
      const { w: ew, h: eh } = this.sizes.sfx[i] ?? { w: 120, h: 60 };
      const minDim = Math.min(w, h);
      const x = Math.max(6, Math.min(w - ew - 6, px + pl.dx * minDim - ew / 2));
      // 上端はスキップボタンと重ならないよう空ける
      const y = Math.max(56, Math.min(h - eh - 6, py + pl.dy * minDim - eh / 2));
      const pop = easeOutBack(progress(t, a, a + 150), 2.5);
      const fade = 1 - easeInCubic(progress(t, b - 180, b));
      el.style.visibility = 'visible';
      el.style.opacity = String(fade);
      el.style.transform = `translate(${x}px, ${y}px) rotate(${pl.rot}deg) scale(${pl.size * (0.4 + 0.6 * pop)})`;
    });
  }

  private renderSpeedLines(t: number, px: number, py: number): void {
    if (!this.lines) return;
    const cfg = SHOW.speedLines;
    let k = 0;
    if (t >= cfg.start && t < cfg.end) {
      if (t <= cfg.peak) {
        const base = lerp(0.35, 1, easeInCubic(progress(t, cfg.start, cfg.peak)));
        // 各段の加速に合わせて強める
        let pulse = 0;
        for (const s of SHOW.stages) {
          const dt = t - s.start;
          if (dt >= 0 && dt < s.move) pulse = Math.max(pulse, Math.sin((dt / s.move) * Math.PI) * 0.35);
        }
        k = Math.min(1, base * progress(t, cfg.start, cfg.start + 80) + pulse);
      } else {
        k = 1 - easeOutCubic(progress(t, cfg.peak, cfg.end));
      }
    }
    this.lines.draw(Math.floor(t / cfg.refreshMs), k * cfg.maxIntensity, px, py, cfg.lines);
  }

  private renderShake(t: number): void {
    let x = 0;
    let y = 0;
    const impacts: { at: number; amp: number }[] = SHOW.stages.map((s) => ({ at: s.start + s.move, amp: s.shake }));
    impacts.push({ at: SHOW.arrival.pinLand, amp: 8 });
    for (const im of impacts) {
      x += shakeAt(t - im.at, im.amp);
      y += shakeAt(t - im.at + 23, im.amp * 0.8);
    }
    this.els.stage.style.transform = x || y ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)` : '';
  }

  private renderPin(t: number): void {
    const { start, pinLand } = SHOW.arrival;
    const pin = this.els.pin;
    const ring = this.els.ring;
    if (t < start) {
      pin.style.opacity = '0';
      ring.style.opacity = '0';
      return;
    }
    pin.style.opacity = '1';
    if (t < pinLand) {
      const k = easeInCubic(progress(t, start, pinLand));
      pin.style.transform = `translateY(${-240 * (1 - k)}px)`;
    } else {
      // 着地のつぶれ→戻り
      const k = progress(t, pinLand, pinLand + 260);
      const squash = Math.sin(k * Math.PI) * (1 - k) * 0.5;
      pin.style.transform = `scale(${1 + squash * 0.6}, ${1 - squash})`;
    }
    const r = progress(t, pinLand, pinLand + 520);
    ring.style.opacity = r > 0 && r < 1 ? String(0.9 * (1 - r)) : '0';
    ring.style.transform = `translate(-50%, -50%) scale(${0.2 + 3.2 * easeOutCubic(r)})`;
  }

  private renderCard(t: number): void {
    const el = this.els.card;
    const { cardStart, cardSettle } = SHOW.arrival;
    if (t < cardStart) {
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
      return;
    }
    const k = progress(t, cardStart, cardSettle);
    // 大きく叩きつけてから、軽く行き過ぎて収まる（ババーン）
    const s = lerp(2.3, 1, easeOutBack(k, 2.6));
    const rot = -7 * (1 - easeOutCubic(k));
    el.style.visibility = 'visible';
    el.style.opacity = String(clamp01(progress(t, cardStart, cardStart + 70)));
    el.style.transform = k >= 1 ? '' : `scale(${s}) rotate(${rot}deg)`;
  }

  /** 場所名カードの右上に「ババーン！」。カードやピンを長く隠さないよう短く出して消す */
  private renderBabaan(t: number): void {
    const el = this.els.babaan;
    const a = SHOW.arrival.cardStart + 60;
    const b = SHOW.arrival.babaanEnd;
    if (t < a || t >= b) return hide(el);
    const { card, babaan, w } = this.sizes;
    const x = Math.max(6, Math.min(w - babaan.w - 6, card.right - babaan.w * 0.85));
    const y = Math.max(56, card.top - babaan.h * 0.95);
    const pop = easeOutBack(progress(t, a, a + 180), 2.4);
    const fade = 1 - easeInCubic(progress(t, b - 250, b));
    el.style.visibility = 'visible';
    el.style.opacity = String(fade);
    el.style.transform = `translate(${x}px, ${y}px) rotate(8deg) scale(${0.3 + 0.7 * pop})`;
  }

  private renderActions(k: number): void {
    const el = this.els.actions;
    el.style.opacity = String(easeOutCubic(k));
    el.style.transform = k >= 1 ? '' : `translateY(${(1 - easeOutCubic(k)) * 18}px)`;
    el.style.pointerEvents = k > 0.5 ? 'auto' : 'none';
    el.toggleAttribute('inert', k <= 0.5);
  }
}

export function phaseAt(t: number): Phase {
  if (t < SHOW.finger.enter) return 'globe';
  if (t < SHOW.pause.start) return 'pointing';
  if (t < SHOW.pause.end) return 'pause';
  if (t < SHOW.arrival.start) return 'zooming';
  // settled への遷移は finish() が行う（操作の解放と同時にするため）
  return 'arrival';
}

function hide(el: HTMLElement): void {
  if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
}

function scalePadding(p: PaddingOptions, k: number): PaddingOptions {
  return {
    top: (p.top ?? 0) * k,
    bottom: (p.bottom ?? 0) * k,
    left: (p.left ?? 0) * k,
    right: (p.right ?? 0) * k,
  };
}
