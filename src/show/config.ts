/**
 * 演出のタイミング・倍率・強さ。ここをいじればテンポを調整できる。
 * 時間はすべて「準備完了＝0ms」からの経過ミリ秒。
 */
export const SHOW = {
  /** 地球登場（0〜） */
  globeIn: { start: 0, end: 700, spinDeg: 50, zoomFrom: -0.9 },
  /** 指差し */
  finger: { enter: 700, arrive: 900 },
  /** 吹き出し：「そうれ、」→「ここ！」 */
  bubble: { soure: 760, koko: 1000, exit: 1800 },
  /** タメ（指したまま静止） */
  pause: { start: 1200, end: 1650 },
  /**
   * 3段階ズーム「ズン、ズン、ズーン」。
   * zoom は「最終倍率に対する差」ではなく絶対値。最後の段は最終倍率へ。
   * move: 急加速して寄る時間、hold: 次の段までの短い間。
   */
  stages: [
    { start: 1650, move: 400, hold: 170, zoom: 4.6, sfx: 'ズン！', shake: 5, bearing: 0 },
    { start: 2220, move: 400, hold: 170, zoom: 10.2, sfx: 'ズン！', shake: 7, bearing: 0 },
    { start: 2790, move: 760, hold: 150, zoom: null, sfx: 'ズーーン！！', shake: 11, bearing: 14 },
  ],
  /** 到着（ピン着地・場所名ババーン） */
  arrival: { start: 3700, pinLand: 3860, cardStart: 3780, cardSettle: 4250, babaanEnd: 4900 },
  /** 余韻のあと操作UIを出す */
  settle: { actionsIn: 5100, end: 5400 },
  /** 集中線 */
  speedLines: { start: 1600, peak: 3720, end: 4050, maxIntensity: 1, lines: 110, refreshMs: 70 },
  /** 地球の大きさ（画面短辺に対する直径の比） */
  globeDiameterRatio: 0.74,
  /** 演出全体の長さ */
  get total(): number {
    return this.settle.end;
  },
} as const;

/** 軽減モーション時の短い切り替え */
export const REDUCED = { cardIn: 350, actionsIn: 500, end: 700 } as const;
