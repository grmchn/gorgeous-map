export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** [a, b] における t の進捗 0..1 */
export const progress = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number): number => t ** 3;
export const easeOutQuart = (t: number): number => 1 - (1 - t) ** 4;
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** 行き過ぎて戻る（ババーンの着地用） */
export const easeOutBack = (t: number, s = 1.70158): number => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;

/**
 * 「ズン」用：最初はタメ気味に、途中で一気に加速し、最後は短くブレーキ。
 * 均等なズームにならないよう、加速側を強めにしてある。
 */
export const punch = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const k = 0.62; // 加速→減速の切り替え位置
  return t < k ? 0.72 * (t / k) ** 3 : 0.72 + 0.28 * easeOutQuart((t - k) / (1 - k));
};

/**
 * 地球のグルグル用：前半は一定の速さで勢いよく回り、brakeAt から急ブレーキ。
 * 少し行き過ぎて戻り「ピタッ」と止まる。ブレーキ開始時の速度はつながるようにしてある。
 */
export const spinEase = (t: number, brakeAt = 0.6, overshoot = 1.2): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const a = brakeAt;
  const v0 = 3 + overshoot; // easeOutBack の初速
  const v = v0 / (1 - a + a * v0);
  if (t < a) return v * t;
  const fa = v * a;
  return fa + (1 - fa) * easeOutBack((t - a) / (1 - a), overshoot);
};

/** 減衰振動（揺れ用）。dt は衝撃からの経過ms。 */
export const shakeAt = (dt: number, amp: number, duration = 260): number => {
  if (dt < 0 || dt > duration) return 0;
  const decay = 1 - dt / duration;
  return amp * decay * decay * Math.sin(dt * 0.11);
};

/** 決まった種から同じ乱数列を作る（同じ時刻なら同じ集中線になる＝描画が t の純関数になる） */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
