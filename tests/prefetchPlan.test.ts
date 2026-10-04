import { describe, expect, it } from 'vitest';
import { startReadiness } from '../src/map/prefetchPlan';

const groups = [
  { count: 4, needAtMs: 3400 }, // ズーム1段目
  { count: 4, needAtMs: 4000 }, // 2段目
  { count: 10, needAtMs: 4900 }, // 最終画面
];

describe('演出を始めてよいかの見積もり', () => {
  it('全部取り終えていれば開始', () => {
    expect(startReadiness(groups, 18, 5000)).toEqual({ ready: true, fraction: 1 });
  });

  it('速さが測れるまでは待つ', () => {
    expect(startReadiness(groups, 1, 1000).ready).toBe(false);
    expect(startReadiness(groups, 3, 100).ready).toBe(false);
  });

  it('速い回線（10件/秒以上）なら残りがあっても開始できる', () => {
    // 4件を 300ms で取得 → 13件/秒。最終画面まで 18件、4.9秒×0.6=2.94秒で 39件取れる見込み
    expect(startReadiness(groups, 4, 300).ready).toBe(true);
  });

  it('遅い回線では待つ。進み具合は 0..1 未満', () => {
    // 2件を 2000ms → 1件/秒。4.9秒×0.6 で 2.9件しか取れない → 18-2.9=15件は先に必要
    const r = startReadiness(groups, 2, 2000);
    expect(r.ready).toBe(false);
    expect(r.fraction).toBeGreaterThan(0);
    expect(r.fraction).toBeLessThan(1);
  });

  it('遅い回線でも、必要な分を取り終えれば開始', () => {
    // 15件を 15秒（1件/秒）→ 残り3件、2.94秒で2.94件 → 足りないので待つ
    expect(startReadiness(groups, 15, 15000).ready).toBe(false);
    // 16件を 16秒 → 残り2件 ≤ 2.94件 → 開始
    expect(startReadiness(groups, 16, 16000).ready).toBe(true);
  });

  it('すぐ必要な群（needAt=0）は取り終えるまで開始しない', () => {
    const now = [{ count: 5, needAtMs: 0 }];
    expect(startReadiness(now, 4, 400).ready).toBe(false);
    expect(startReadiness(now, 5, 400).ready).toBe(true);
  });

  it('余裕（margin）を小さくすると、より多く先に読む', () => {
    const loose = startReadiness(groups, 4, 600, 0.9);
    const tight = startReadiness(groups, 4, 600, 0.3);
    expect(loose.ready).toBe(true);
    expect(tight.ready).toBe(false);
  });
});
