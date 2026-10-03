import { lerp, seeded } from './easing';

/**
 * マンガの集中線。focus（目的地の画面座標）へ向かって収束する楔形を描く。
 * draw() は (時刻, 強さ, 焦点) だけで決まる純関数的な描画なので、スキップや再生し直しで状態が残らない。
 */
export class SpeedLines {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * @param frameSeed 何フレームごとに線を描き直すかで決まる種（同じ種なら同じ線）
   * @param intensity 0..1
   */
  draw(frameSeed: number, intensity: number, fx: number, fy: number, lineCount: number): void {
    if (this.w === 0) this.resize();
    this.clear();
    if (intensity <= 0.001) return;
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const minDim = Math.min(w, h);
    // 強いほど線が中心まで食い込む
    const inner = lerp(0.5, 0.17, intensity) * minDim;
    const outer = Math.hypot(Math.max(fx, w - fx), Math.max(fy, h - fy)) + 20;
    const count = Math.round(lineCount * lerp(0.45, 1, intensity));
    const rnd = seeded(frameSeed * 7919 + 17);

    // 外周を少し暗くして焦点を際立たせる
    const g = ctx.createRadialGradient(fx, fy, inner * 0.9, fx, fy, outer);
    g.addColorStop(0, 'rgba(10, 8, 30, 0)');
    g.addColorStop(1, `rgba(10, 8, 30, ${0.38 * intensity})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rnd() - 0.5) * ((Math.PI * 2) / count) * 1.6;
      const r0 = inner * lerp(1, 1.55, rnd() ** 2);
      const halfW = lerp(1.2, 5.5, rnd() ** 1.6) * lerp(0.7, 1.25, intensity);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const x0 = fx + cos * r0;
      const y0 = fy + sin * r0;
      const x1 = fx + cos * outer;
      const y1 = fy + sin * outer;
      const nx = -sin * halfW;
      const ny = cos * halfW;
      const light = i % 3 === 0;
      ctx.fillStyle = light
        ? `rgba(255, 255, 255, ${0.7 * intensity})`
        : `rgba(12, 10, 32, ${0.62 * intensity})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 + nx, y1 + ny);
      ctx.lineTo(x1 - nx, y1 - ny);
      ctx.closePath();
      ctx.fill();
    }
  }
}
