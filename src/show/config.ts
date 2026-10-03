/**
 * 演出のタイミング・倍率・強さ。ここをいじればテンポを調整できる。
 * 時間はすべて「準備完了＝0ms」からの経過ミリ秒。
 */

/** 地球がグルグル回る時間。指差し以降はすべてこの後ろにずれる。 */
const SPIN_END = 1400;
/** SPIN_END を基準にした相対時刻 */
const at = (ms: number) => SPIN_END + ms;

export const SHOW = {
  /** セリフ（吹き出しとカードの見出し） */
  lines: { first: 'そーれ！', second: 'ここぉ！' },
  /**
   * 地球登場：何周もグルグル回りながら現れ、減速して目的地が正面に来たところでピタッと止まる。
   * spinDeg: 回転量（度）。720 = 2周。tiltDeg: 回転中だけ地軸を少し傾けて勢いを出す。
   * brakeAt: 一定速度で回る割合（残りでブレーキ）。overshoot: 止まるときの行き過ぎの強さ。
   */
  globeIn: { start: 0, end: SPIN_END, spinDeg: 900, tiltDeg: 18, zoomFrom: -1.1, brakeAt: 0.6, overshoot: 1.2 },
  /** 指差し */
  finger: { enter: at(0), arrive: at(200) },
  /** 吹き出し：「そーれ！」→「ここぉ！」 */
  bubble: { soure: at(60), koko: at(320), exit: at(1180) },
  /** タメ（指したまま静止） */
  pause: { start: at(560), end: at(1010) },
  /**
   * 3段階ズーム「ズン、ズン、ズーン」。
   * zoom は絶対値。最後の段（null）は最終倍率へ。
   * move: 急加速して寄る時間、hold: 次の段までの短い間。
   */
  stages: [
    { start: at(1010), move: 400, hold: 170, zoom: 4.6, sfx: 'ズン！', shake: 5, bearing: 0 },
    { start: at(1580), move: 400, hold: 170, zoom: 10.2, sfx: 'ズン！', shake: 7, bearing: 0 },
    { start: at(2150), move: 760, hold: 150, zoom: null, sfx: 'ズーーン！！', shake: 11, bearing: 14 },
  ],
  /** 到着（ピン着地・場所名ババーン） */
  arrival: { start: at(3060), pinLand: at(3220), cardStart: at(3140), cardSettle: at(3610), babaanEnd: at(4260) },
  /** 余韻のあと操作UIを出す */
  settle: { actionsIn: at(4460), end: at(4760) },
  /** 集中線 */
  speedLines: { start: at(960), peak: at(3080), end: at(3410), maxIntensity: 1, lines: 110, refreshMs: 70 },
  /** イベント名の「○○の場所は…」予告（イベント名があるときだけ） */
  teaser: { start: 250, end: at(1110) },
  /** 地球の大きさ（画面短辺に対する直径の比） */
  globeDiameterRatio: 0.74,
  /** 演出全体の長さ */
  get total(): number {
    return this.settle.end;
  },
} as const;

/** 軽減モーション時の短い切り替え */
export const REDUCED = { cardIn: 350, actionsIn: 500, end: 700 } as const;
