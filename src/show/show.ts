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
  spinEase,
} from './easing';
import { Fx } from './fx';
import type { ShowSound } from './sound';
import { SpeedLines } from './speedLines';

export type Phase = 'loading' | 'globe' | 'pointing' | 'pause' | 'zooming' | 'arrival' | 'settled';

export interface ShowElements {
  /** 揺らす対象（地図・集中線・指などをまとめた箱） */
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  /** 地図の後ろ（後光）と前（回転線・衝撃波・紙吹雪）のエフェクト用キャンバス */
  bgCanvas: HTMLCanvasElement;
  fxCanvas: HTMLCanvasElement;
  finger: HTMLElement;
  /** 「そぉ～れ」の吹き出し */
  callFirst: HTMLElement;
  /** 「ここぉ！」の吹き出し */
  callSecond: HTMLElement;
  /** 指先の衝撃線 */
  poke: HTMLElement;
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
  /** 上部タイトル等を避けるための上端（px） */
  getTopInset: () => number;
  /** BGM・効果音（音を出すかどうかは soundOn で判定） */
  sound?: ShowSound;
  soundOn?: () => boolean;
  onPhase?: (phase: Phase) => void;
}

/** 指アイコンの指先位置（要素左上からのpx）と向き */
const FINGER_TIP = { x: 4, y: 58 };
/** 左向きの指を時計回りに傾け、右下から左上を指す */
const FINGER_ANGLE = 28;

/**
 * 演出の進行役。描画はすべて「経過時間 t の関数」として計算するので、
 * スキップは t を終端に飛ばすだけ、再生し直しは t=0 に戻すだけで済み、古い状態が残らない。
 */
export class Show {
  private raf = 0;
  private startAt = 0;
  private phase: Phase = 'loading';
  private lines: SpeedLines | null = null;
  private fx: Fx;
  private destroyed = false;
  private finalT: number;
  private zoomList: number[];
  /** 毎フレームのレイアウト読み取りを避けるため、サイズはまとめて測っておく */
  private sizes = {
    w: 0,
    h: 0,
    top: 12,
    globeR: 140,
    callFirst: { w: 180, h: 70 },
    callSecond: { w: 180, h: 80 },
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
    this.fx = new Fx(els.bgCanvas, els.fxCanvas);
    try {
      this.lines = new SpeedLines(els.canvas);
    } catch {
      this.lines = null;
    }
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** 演出の経過時間（ms）。終了後は終端の時刻 */
  get elapsed(): number {
    if (this.phase === 'settled') return this.finalT;
    return Math.min(this.finalT, performance.now() - this.startAt);
  }

  /** 演出の途中で音をオン／オフしたとき用：今の時刻から鳴らし直す */
  syncSound(): void {
    if (this.opts.soundOn?.() && this.phase !== 'settled') {
      this.opts.sound?.play(this.elapsed, { reduced: this.opts.reducedMotion });
    } else {
      this.opts.sound?.stop();
    }
  }

  /** 最初から再生（再生中に呼んでも安全） */
  play(): void {
    if (this.destroyed) return;
    cancelAnimationFrame(this.raf);
    this.setInteractive(false);
    this.measure();
    this.startAt = performance.now();
    this.els.skip.hidden = false;
    if (this.opts.soundOn?.()) this.opts.sound?.play(0, { reduced: this.opts.reducedMotion });
    else this.opts.sound?.stop();
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
    if (this.opts.soundOn?.()) this.opts.sound?.playFinale();
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
    this.opts.sound?.stop();
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
    this.fx.resize();
    const r = this.els.stage.getBoundingClientRect();
    this.sizes.w = r.width;
    this.sizes.h = r.height;
    this.sizes.top = this.opts.getTopInset();
    this.sizes.globeR = (Math.max(160, Math.min(r.width, r.height * 0.8)) * SHOW.globeDiameterRatio) / 2;
    const { callFirst: a, callSecond: b } = this.els;
    this.sizes.callFirst = { w: a.offsetWidth || 180, h: a.offsetHeight || 70 };
    this.sizes.callSecond = { w: b.offsetWidth || 180, h: b.offsetHeight || 80 };
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
    this.fx.clear();
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
    const spin = this.spinAt(t);

    this.map.jumpTo({
      // 経度をずらして地球を回す。最後は少し行き過ぎて戻り、目的地が正面でピタッと止まる
      center: [normalizeLng(lng + SHOW.globeIn.spinDeg * (1 - spin)), lat],
      zoom,
      bearing: this.bearingAt(t),
      pitch: 0,
      padding: scalePadding(finalPad, padK),
    });

    const p = this.map.project([lng, lat]);
    // 回転中は目的地が地球の表面を動くので、地球まわりの演出は「地球の中心」と「今の半径」を基準にする
    const gc = this.map.project(this.map.getCenter());
    const globeR = this.globeRadius(zoom);
    const { w } = this.sizes;

    this.renderFinger(t, p.x, p.y);
    this.renderCalls(t, p.x, p.y, w, gc.x, gc.y);
    this.renderPoke(t, p.x, p.y);
    this.renderSpeedLines(t, p.x, p.y);
    const c = this.sizes.card;
    this.fx.draw(t, p.x, p.y, gc.x, gc.y, globeR, t >= SHOW.arrival.start ? { x: p.x, y: p.y } : null, c);
    this.renderShake(t);
    this.renderPin(t);
    this.renderCard(t);
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
    hide(this.els.callFirst);
    hide(this.els.callSecond);
    hide(this.els.poke);
    this.lines?.clear();
    this.fx.clear();
    this.els.pin.style.opacity = '1';
    this.els.pin.style.transform = '';
    this.els.ring.style.opacity = '0';
    const c = progress(t, 0, REDUCED.cardIn);
    this.els.card.style.opacity = String(c);
    this.els.card.style.transform = '';
    this.els.card.style.visibility = c > 0 ? 'visible' : 'hidden';
    this.renderActions(progress(t, REDUCED.actionsIn, REDUCED.end));
  }

  /** 倍率 zoom のときの地球の見た目の半径（px）。globeZoom() の逆算 */
  private globeRadius(zoom: number): number {
    const latAdj = Math.log2(Math.max(0.05, Math.cos((this.place.lat * Math.PI) / 180)));
    return (256 * 2 ** (zoom - latAdj)) / Math.PI;
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

  /** 地球の回転の進み具合（0→1、終盤にわずかに 1 を超えて戻る） */
  private spinAt(t: number): number {
    const g = SHOW.globeIn;
    return spinEase(progress(t, g.start, g.end), g.brakeAt, g.overshoot);
  }

  private bearingAt(t: number): number {
    if (t < SHOW.globeIn.end) {
      // 回っている間は地軸を傾けて勢いを出し、止まるときにまっすぐ戻す
      const k = easeInOutCubic(progress(t, SHOW.globeIn.start, SHOW.globeIn.end));
      return SHOW.globeIn.tiltDeg * (1 - k);
    }
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
      // 手首の方向（右下）から飛び込んでくる
      dx = (1 - k) * 350;
      dy = (1 - k) * 190;
      opacity = clamp01(progress(t, enter, enter + 60));
    } else if (t >= exitStart) {
      // 指が地図へ「ズブッ」と押し込まれるように縮んで消える
      const k = easeInCubic(progress(t, exitStart, exitEnd));
      scale = 1 - 0.55 * k;
      opacity = 1 - k;
    } else {
      // 刺さった反動で一瞬つぶれ、タメの間はわずかに押し込んだまま静止
      const hit = progress(t, arrive, arrive + 160);
      scale = 1 - 0.08 * Math.sin(Math.PI * hit) - 0.03 * easeOutCubic(progress(t, SHOW.pause.start, SHOW.pause.start + 200));
    }
    el.style.visibility = 'visible';
    el.style.opacity = String(opacity);
    el.style.transform = `translate(${px - FINGER_TIP.x + dx}px, ${py - FINGER_TIP.y + dy}px) rotate(${FINGER_ANGLE}deg) scale(${scale})`;
  }

  /** 吹き出し2つ：回り始めの「そぉ～れ」（地球の上）と、指した瞬間の「ここぉ！」（指先の左上） */
  private renderCalls(t: number, px: number, py: number, w: number, gx: number, gy: number): void {
    const exitStart = SHOW.stages[0].start;
    const exitEnd = SHOW.bubbleExit;
    const { top, globeR } = this.sizes;
    const exitK = progress(t, exitStart, exitEnd);
    const exitScale = 1 + 0.35 * exitK;
    const exitOpacity = 1 - easeInCubic(exitK);

    const a = this.els.callFirst;
    const { in: aIn, out: aOut } = SHOW.callFirst;
    if (t < aIn || t >= aOut) hide(a);
    else {
      const { w: aw, h: ah } = this.sizes.callFirst;
      // 地球の上（回転中は目的地が動くので地球の中心を基準にする）
      const x = Math.max(8, Math.min(w - aw - 8, gx - aw * 0.6));
      const y = Math.max(top, gy - globeR - ah - 18);
      // 語尾を伸ばすようにゆらゆら揺れ、最後はふわっと上に抜けて消える
      const rot = Math.sin((t - aIn) / 105) * 5;
      const out = easeInCubic(progress(t, aOut - 200, aOut));
      const s = easeOutBack(progress(t, aIn, aIn + 170), 2.2) * (1 - 0.25 * out);
      a.style.visibility = 'visible';
      a.style.opacity = String(1 - out);
      a.style.transform = `translate(${x}px, ${y - 24 * out}px) rotate(${rot}deg) scale(${s})`;
      a.style.setProperty('--tail-x', `${aw * 0.7}px`);
    }

    const b = this.els.callSecond;
    const bIn = SHOW.callSecond.in;
    if (t < bIn || t >= exitEnd) hide(b);
    else {
      const { w: bw, h: bh } = this.sizes.callSecond;
      // 指は右下から来るので、吹き出しは地点の左上。しっぽは地点を指す
      // 飛び出し時の拡大で画面外に出ないよう、左右に少し余裕を取る
      const x = Math.max(18, Math.min(w - bw - 18, px - bw * 0.82));
      const y = Math.max(top, py - bh - 34);
      const s = easeOutBack(progress(t, bIn, bIn + 180), 2) * exitScale;
      b.style.visibility = 'visible';
      b.style.opacity = String(exitOpacity);
      b.style.transform = `translate(${x}px, ${y}px) rotate(-4deg) scale(${s})`;
      b.style.setProperty('--tail-x', `${Math.max(22, Math.min(bw - 22, px - x))}px`);
    }
  }

  /** 指が刺さった瞬間の「ビシッ」 */
  private renderPoke(t: number, px: number, py: number): void {
    const el = this.els.poke;
    const a = SHOW.finger.arrive;
    const k = progress(t, a, a + 340);
    if (t < a || k >= 1) return hide(el);
    el.style.visibility = 'visible';
    el.style.opacity = String(1 - easeInCubic(k));
    el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${0.5 + 0.8 * easeOutCubic(k)})`;
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

function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
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
