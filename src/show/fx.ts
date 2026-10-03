import { SHOW } from './config';
import { clamp01, easeInCubic, easeOutCubic, progress, seeded, spinEase } from './easing';

/**
 * 派手なエフェクト（キャンバス描画）。どれも t の純関数なので、スキップや再生し直しで状態が残らない。
 * - 背景：地球の後ろで回る放射状の後光（「ここぉ！」で金色に光る）
 * - 回転線：地球がグルグル回っている間、左右にマンガの回転線
 * - 衝撃波：ズーム各段の着弾とピン着地でリングが広がる
 * - 火花：ピン着地
 * - 場所名の着地（文字は出さずにエフェクトで「バ・バーン！」）：
 *   カード後ろから放射する金色の光線、衝撃波、左右下からの紙吹雪キャノン、カードまわりのキラキラ
 */
export class Fx {
  private bg: Ctx2D;
  private fg: Ctx2D;

  constructor(bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement) {
    this.bg = new Ctx2D(bgCanvas);
    this.fg = new Ctx2D(fgCanvas);
  }

  resize(): void {
    this.bg.resize();
    this.fg.resize();
  }

  clear(): void {
    this.bg.clear();
    this.fg.clear();
  }

  /** p: 目的地の画面座標、g: 地球の中心の画面座標、globeR: 地球の見た目の半径 */
  draw(
    t: number,
    px: number,
    py: number,
    gx: number,
    gy: number,
    globeR: number,
    pin: { x: number; y: number } | null,
    card: Rect,
  ): void {
    if (!this.bg.ctx || !this.fg.ctx) return;
    this.bg.clear();
    this.fg.clear();
    this.drawRays(t, gx, gy, globeR);
    this.drawSpinArcs(t, gx, gy, globeR);
    this.drawShockwaves(t, px, py, pin);
    if (pin) this.drawSparks(t, pin.x, pin.y);
    this.drawCardBang(t, card);
    this.drawConfettiCannons(t);
    this.drawTwinkles(t, card);
  }

  /** 地球の後ろの後光 */
  private drawRays(t: number, cx: number, cy: number, r: number): void {
    const fadeIn = progress(t, 0, 500);
    const fadeOut = 1 - progress(t, SHOW.stages[0].start, SHOW.stages[0].start + 350);
    const vis = Math.min(fadeIn, fadeOut);
    if (vis <= 0) return;
    const { ctx, w, h } = this.bg.begin();
    const flare = easeOutCubic(progress(t, SHOW.callSecond.in, SHOW.callSecond.in + 250));
    const n = 18;
    const len = Math.hypot(w, h);
    const rot = t / 2600 + flare * 0.15;
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI / n) * 0.9;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r * 0.6, Math.sin(a0) * r * 0.6);
      ctx.lineTo(Math.cos(a0) * len, Math.sin(a0) * len);
      ctx.lineTo(Math.cos(a1) * len, Math.sin(a1) * len);
      ctx.closePath();
      // 回っている間は落ち着いた紫、「ここぉ！」で金色に
      const a = vis * (0.16 + 0.22 * flare);
      ctx.fillStyle = flare > 0 ? `rgba(255, ${190 + 30 * (1 - flare)}, 40, ${a})` : `rgba(120, 110, 255, ${a})`;
      ctx.fill();
    }
    // 中心の光
    const g = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * (1.6 + 0.5 * flare));
    g.addColorStop(0, `rgba(255, 230, 140, ${vis * (0.12 + 0.35 * flare)})`);
    g.addColorStop(1, 'rgba(255, 230, 140, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 地球の回転エフェクト（回転が速いほど強い）
   * - 地球の手前を横切る、先が太く尾が細い流線（緯線に沿った楕円弧。回転方向に流れる）
   * - 地球の外周をなでる光の弧（加算合成でふわっと光る）
   * - 縁のハイライト（リムライト）
   */
  private drawSpinArcs(t: number, cx: number, cy: number, r: number): void {
    const g = SHOW.globeIn;
    if (t <= g.start || t >= g.end + 120) return;
    const p = progress(t, g.start, g.end);
    const e = 0.004;
    const speed =
      (spinEase(Math.min(1, p + e), g.brakeAt, g.overshoot) - spinEase(Math.max(0, p - e), g.brakeAt, g.overshoot)) / (2 * e);
    const k = clamp01(speed / 1.6) * progress(t, 0, 180);
    if (k <= 0.02) return;
    const { ctx } = this.fg.begin();
    const spinAngle = spinEase(p, g.brakeAt, g.overshoot) * ((SHOW.globeIn.spinDeg * Math.PI) / 180);
    ctx.save();
    ctx.translate(cx, cy);

    // 1) 縁のリムライト
    const rim = ctx.createRadialGradient(0, 0, r * 0.86, 0, 0, r * 1.18);
    rim.addColorStop(0, 'rgba(160, 210, 255, 0)');
    rim.addColorStop(0.55, `rgba(180, 225, 255, ${0.55 * k})`);
    rim.addColorStop(1, 'rgba(180, 225, 255, 0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    // 2) 外周をなでる光の弧（左右）。地球と一緒に回る位相で流れる
    for (let i = 0; i < 6; i++) {
      const rr = r * (1.07 + i * 0.065);
      const phase = spinAngle * (0.9 + i * 0.07) + i * 1.3;
      for (const side of [0, Math.PI]) {
        const mid = side + Math.sin(phase) * 0.35;
        const span = (0.55 + 0.25 * Math.sin(phase * 1.7 + i)) * (0.6 + 0.4 * k);
        taperedArc(ctx, 0, 0, rr, rr * 0.97, mid - span, mid + span, (6 - i * 0.7) * (0.5 + 0.7 * k), `rgba(200, 235, 255, ${0.5 * k * (1 - i * 0.12)})`, side === 0);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // 3) 地球の手前を横切る流線（緯線に沿った楕円の手前半分）。右から左へ流れる
    const rnd = seeded(5);
    for (let i = 0; i < 9; i++) {
      const lat = (rnd() - 0.5) * 1.5; // -0.75..0.75 rad
      const y = Math.sin(lat) * r;
      const rx = Math.cos(lat) * r * 1.02;
      const ry = rx * 0.16;
      const len = 0.45 + 0.5 * rnd();
      const speedMul = 0.8 + 0.6 * rnd();
      const head = Math.PI - (((spinAngle * speedMul + rnd() * 6.3) % (Math.PI + len)) - len * 0.5);
      const a0 = Math.max(0.05, head - len);
      const a1 = Math.min(Math.PI - 0.05, head);
      if (a1 <= a0) continue;
      const wid = (3 + 3 * rnd()) * (0.4 + 0.8 * k);
      ctx.save();
      ctx.translate(0, y);
      // 白い陸の上でも見えるよう、薄い紺の縁を付けてから白を重ねる
      taperedArc(ctx, 0, 0, rx, ry, a0, a1, wid + 3, `rgba(20, 40, 120, ${0.3 * k})`, false);
      taperedArc(ctx, 0, 0, rx, ry, a0, a1, wid, `rgba(255, 255, 255, ${0.9 * k})`, false);
      ctx.restore();
    }
    ctx.restore();
  }

  /** 着弾ごとに広がる衝撃波 */
  private drawShockwaves(t: number, px: number, py: number, pin: { x: number; y: number } | null): void {
    const hits = SHOW.stages.map((s, i) => ({ at: s.start + s.move, x: px, y: py, size: 0.55 + i * 0.2, flash: i === SHOW.stages.length - 1 }));
    if (pin) hits.push({ at: SHOW.arrival.pinLand, x: pin.x, y: pin.y, size: 0.7, flash: true });
    const { ctx, w, h } = this.fg.begin();
    const maxR = Math.hypot(w, h);
    for (const hit of hits) {
      const k = progress(t, hit.at, hit.at + 420);
      if (k <= 0 || k >= 1) continue;
      const e = easeOutCubic(k);
      for (const [mult, color] of [
        [1, '255, 255, 255'],
        [0.7, '255, 198, 26'],
      ] as const) {
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, maxR * hit.size * e * mult, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color}, ${0.85 * (1 - k)})`;
        ctx.lineWidth = 18 * (1 - k) + 2;
        ctx.stroke();
      }
      // 一瞬だけ白く光る（連続点滅にならないよう、最後の段と着地だけ・弱め）
      if (hit.flash) {
        const f = 1 - progress(t, hit.at, hit.at + 140);
        if (f > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * f})`;
          ctx.fillRect(0, 0, w, h);
        }
      }
    }
  }

  /** ピン着地で飛び散る火花 */
  private drawSparks(t: number, x: number, y: number): void {
    const t0 = SHOW.arrival.pinLand;
    const k = progress(t, t0, t0 + 750);
    if (k <= 0 || k >= 1) return;
    const { ctx } = this.fg.begin();
    const rnd = seeded(77);
    const dt = (t - t0) / 1000;
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * (0.05 + 0.9 * rnd());
      const v = 380 + 420 * rnd();
      const sx = x + Math.cos(a) * v * dt;
      const sy = y + Math.sin(a) * v * dt + 900 * dt * dt;
      const size = (4 + 5 * rnd()) * (1 - k * 0.6);
      ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,${1 - k})` : `rgba(255,${180 + 60 * rnd()},30,${1 - k})`;
      star(ctx, sx, sy, size, t / 90 + i);
    }
  }

  /** 場所名カードの「バ・バーン！」：カードの後ろから光線が噴き出し、衝撃波が広がる */
  private drawCardBang(t: number, card: Rect): void {
    const { cardStart, cardBang } = SHOW.arrival;
    const end = cardBang + 900;
    if (t < cardStart || t >= end || card.right <= card.left) return;
    const { ctx, w, h } = this.fg.begin();
    const cx = (card.left + card.right) / 2;
    const cy = (card.top + card.bottom) / 2;
    const len = Math.hypot(w, h);
    // 「バ」で小さく、「バーン」で大きく
    const small = progress(t, cardStart, cardStart + 200);
    const big = progress(t, cardBang, end);
    const k = t < cardBang ? 0.45 * easeOutCubic(small) : 0.45 + 0.55 * easeOutCubic(Math.min(1, big * 3));
    const vis = t < cardBang ? 1 - 0.4 * small : 1 - easeInCubic(big);
    const n = 24;
    const rot = t / 900;
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI / n) * (i % 2 ? 0.5 : 0.9);
      const r = len * k * (i % 2 ? 0.75 : 1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? `rgba(255, 45, 85, ${0.35 * vis})` : `rgba(255, 198, 26, ${0.55 * vis})`;
      ctx.fill();
    }
    ctx.restore();
    // 衝撃波（「バ」と「バーン」の2発）
    for (const [at, size, width] of [
      [cardStart, 0.35, 10],
      [cardBang, 0.8, 22],
    ] as const) {
      const q = progress(t, at, at + 500);
      if (q <= 0 || q >= 1) continue;
      const e = easeOutCubic(q);
      ctx.beginPath();
      ctx.ellipse(cx, cy, len * size * e, len * size * e * 0.75, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - q)})`;
      ctx.lineWidth = width * (1 - q) + 2;
      ctx.stroke();
    }
  }

  /** 「バーン」に合わせて画面の左右下から紙吹雪を打ち上げる */
  private drawConfettiCannons(t: number): void {
    const t0 = SHOW.arrival.cardBang;
    const end = SHOW.settle.end;
    if (t < t0 || t >= end) return;
    const { ctx, w, h } = this.fg.begin();
    const fade = 1 - easeInCubic(progress(t, end - 350, end));
    const rnd = seeded(2024);
    const colors = ['#ffc61a', '#ff2d55', '#ffffff', '#4fd18b', '#3a8bff', '#ff8a00'];
    const dt = (t - t0) / 1000;
    const g = 1400;
    for (let i = 0; i < 140; i++) {
      const side = i % 2 ? 1 : -1;
      const delay = rnd() * 0.12;
      const vx = -side * (120 + 380 * rnd()) * (w / 400);
      const vy = -(900 + 600 * rnd()) * Math.min(1.3, h / 800);
      const phase = rnd() * Math.PI * 2;
      const spin = 6 + 10 * rnd();
      const cw = 7 + 6 * rnd();
      const ch = 4 + 4 * rnd();
      const color = colors[i % colors.length];
      const tt = dt - delay;
      if (tt <= 0) continue;
      // 打ち上げ→空気抵抗で減速→ひらひら落ちる
      const drag = 1 - Math.exp(-tt * 2.2);
      const x = (side > 0 ? w + 10 : -10) + (vx / 2.2) * drag + Math.sin(phase + tt * 6) * 14 * Math.min(1, tt * 2);
      const y = h * 0.92 + (vy / 2.2) * drag + 0.5 * g * 0.18 * tt * tt * 2;
      if (y > h + 30) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(phase + tt * spin);
      ctx.scale(1, Math.cos(phase + tt * spin * 1.3));
      ctx.globalAlpha = fade;
      ctx.fillStyle = color;
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.restore();
    }
  }

  /** 余韻の間、カードのまわりでキラキラ */
  private drawTwinkles(t: number, card: Rect): void {
    const t0 = SHOW.arrival.cardBang + 150;
    const end = SHOW.settle.end;
    if (t < t0 || t >= end || card.right <= card.left) return;
    const { ctx } = this.fg.begin();
    const fade = 1 - easeInCubic(progress(t, end - 300, end));
    const rnd = seeded(31);
    for (let i = 0; i < 10; i++) {
      const x = card.left + (rnd() * 1.1 - 0.05) * (card.right - card.left);
      const y = card.top - 10 - rnd() * 60 + (i % 3 === 0 ? card.bottom - card.top + 40 : 0);
      const period = 500 + 400 * rnd();
      const ph = ((t - t0 + rnd() * period) % period) / period;
      const s = Math.sin(ph * Math.PI) * (8 + 8 * rnd());
      if (s <= 0.5) continue;
      ctx.fillStyle = `rgba(255, 236, 140, ${fade})`;
      sparkle(ctx, x, y, s);
    }
  }
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/**
 * 先が太く尾が細い弧（楕円）を塗る。headAtStart=true なら a0 側が頭。
 */
function taperedArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  width: number,
  color: string,
  headAtStart: boolean,
): void {
  const n = 28;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = a0 + (a1 - a0) * s;
    const u = headAtStart ? 1 - s : s; // 頭側で 1
    const wHalf = (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.08)), 0.6) * (0.25 + 0.75 * u);
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    // 楕円の法線方向
    const nx = Math.cos(a) / rx;
    const ny = Math.sin(a) / ry;
    const nl = Math.hypot(nx, ny) || 1;
    outer.push([x + (nx / nl) * wHalf, y + (ny / nl) * wHalf]);
    inner.push([x - (nx / nl) * wHalf, y - (ny / nl) * wHalf]);
  }
  ctx.beginPath();
  ctx.moveTo(outer[0][0], outer[0][1]);
  for (const [x, y] of outer) ctx.lineTo(x, y);
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.4;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** devicePixelRatio を考慮した 2D キャンバス */
class Ctx2D {
  ctx: CanvasRenderingContext2D | null;
  private dpr = 1;
  w = 0;
  h = 0;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }
  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }
  clear(): void {
    if (!this.ctx) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  begin(): { ctx: CanvasRenderingContext2D; w: number; h: number } {
    if (this.w === 0) this.resize();
    const ctx = this.ctx!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return { ctx, w: this.w, h: this.h };
  }
}
