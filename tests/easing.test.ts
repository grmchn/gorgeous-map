import { describe, expect, it } from 'vitest';
import { spinEase } from '../src/show/easing';

describe('地球のグルグル', () => {
  it('0→1 で始まって終わり、終盤だけ少し行き過ぎる', () => {
    expect(spinEase(0)).toBe(0);
    expect(spinEase(1)).toBe(1);
    const samples = Array.from({ length: 101 }, (_, i) => spinEase(i / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(Math.max(...samples.slice(0, 60))).toBeLessThan(1);
  });

  it('ブレーキ開始で速度が途切れない', () => {
    const e = 1e-4;
    const before = (spinEase(0.6) - spinEase(0.6 - e)) / e;
    const after = (spinEase(0.6 + e) - spinEase(0.6)) / e;
    expect(Math.abs(before - after) / before).toBeLessThan(0.01);
  });
});
