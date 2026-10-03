import { SHOW } from './config';
import { clamp01, easeInCubic, easeOutCubic, progress, seeded, spinEase } from './easing';

/**
 * 派手なエフェクト（キャンバス描画）。どれも t の純関数なので、スキップや再生し直しで状態が残らない。
 * - 背景：地球の後ろで回る放射状の後光（「ここぉ！」で金色に光る）
 * - 回転線：地球がグルグル回っている間、左右にマンガの回転線
 * - 衝撃波：ズーム各段の着弾とピン着地でリングが広がる
 * - 火花と紙吹雪：到着時
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
  ): void {
    if (!this.bg.ctx || !this.fg.ctx) return;
    this.bg.clear();
    this.fg.clear();
    this.drawRays(t, gx, gy, globeR);
    this.drawSpinArcs(t, gx, gy, globeR);
    this.drawShockwaves(t, px, py, pin);
    if (pin) this.drawSparks(t, pin.x, pin.y);
    this.drawConfetti(t);
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

  /** 地球の左右に出るマンガの回転線（回転が速いほど濃い） */
  private drawSpinArcs(t: number, cx: number, cy: number, r: number): void {
    const g = SHOW.globeIn;
    if (t <= g.start || t >= g.end) return;
    const p = progress(t, g.start, g.end);
    const e = 0.004;
    const speed = (spinEase(Math.min(1, p + e), g.brakeAt, g.overshoot) - spinEase(Math.max(0, p - e), g.brakeAt, g.overshoot)) / (2 * e);
    const k = clamp01(speed / 1.6) * progress(t, 0, 200);
    if (k <= 0.02) return;
    const { ctx } = this.fg.begin();
    const rnd = seeded(Math.floor(t / 60) + 3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const rr = r * (1.08 + i * 0.09 + rnd() * 0.03);
        const span = 0.35 + 0.35 * rnd();
        const mid = (side > 0 ? 0 : Math.PI) + (rnd() - 0.5) * 0.5;
        ctx.beginPath();
        // 楕円にして「横回転」に見せる
        ctx.ellipse(0, 0, rr, rr * 0.92, 0, mid - span, mid + span);
        ctx.strokeStyle = `rgba(255, 255, 255, ${k * (0.85 - i * 0.15)})`;
        ctx.lineWidth = (5 - i) * (0.6 + 0.6 * k);
        ctx.stroke();
      }
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

  /** 「バーン！」で降る紙吹雪 */
  private drawConfetti(t: number): void {
    const t0 = SHOW.arrival.cardStart + 170;
    const end = SHOW.settle.end;
    if (t < t0 || t >= end) return;
    const { ctx, w, h } = this.fg.begin();
    const fade = 1 - easeInCubic(progress(t, end - 350, end));
    const rnd = seeded(2024);
    const colors = ['#ffc61a', '#ff2d55', '#ffffff', '#4fd18b', '#3a8bff', '#ff8a00'];
    const dt = (t - t0) / 1000;
    for (let i = 0; i < 110; i++) {
      const delay = rnd() * 0.5;
      const x0 = rnd() * w;
      const vy = 260 + 260 * rnd();
      const sway = 18 + 30 * rnd();
      const phase = rnd() * Math.PI * 2;
      const spin = 4 + 8 * rnd();
      const cw = 6 + 6 * rnd();
      const ch = 3 + 4 * rnd();
      const color = colors[i % colors.length];
      const tt = dt - delay;
      if (tt <= 0) continue;
      const y = -20 + vy * tt;
      if (y > h + 20) continue;
      const x = x0 + Math.sin(phase + tt * 5) * sway;
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
