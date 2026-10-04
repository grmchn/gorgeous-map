/**
 * 「今、演出を始めてよいか」の見積もり（DOM・ネットワークに依存しない純粋な計算）。
 *
 * groups は必要になる順に並んだタイル群で、needAtMs は「演出開始から何ms後に必要か」。
 * これまでの実測の速さ（取得済み数 / 経過時間）で残りを取り続けたとき、
 * どの群も needAtMs × margin までに取り終わる見込みなら ready。
 * margin を 1 より小さくして、回線の揺らぎや地図側の読み込みとの取り合いに余裕を持たせる。
 */
export interface PrefetchGroupSpec {
  count: number;
  needAtMs: number;
}

/** 停止位置だけでなく、各ズームの途中で通る整数倍率も先読みする。 */
export function zoomPrefetchSteps(
  stages: readonly { zoom: number | null; start: number }[],
  finalZoom: number,
): { zoom: number; needAtMs: number }[] {
  const steps: { zoom: number; needAtMs: number }[] = [];
  let zoom = 1;
  for (const stage of stages) {
    const target = Math.floor(stage.zoom ?? finalZoom);
    while (zoom <= target) {
      steps.push({ zoom: zoom++, needAtMs: stage.start });
    }
  }
  return steps;
}

/** 画面の対角線を覆い、回転・パディング用に半タイル分の余裕を足す（512px/タイル）。 */
export function prefetchRadius(width: number, height: number): number {
  return Math.max(1, Math.ceil((Math.hypot(width, height) / 1024 + 0.5) * 2) / 2);
}

/** 速さを測るのに最低限ほしい件数・時間（これ未満では見積もらない） */
const MIN_SAMPLES = 2;
const MIN_ELAPSED_MS = 300;

export function startReadiness(
  groups: PrefetchGroupSpec[],
  completed: number,
  elapsedMs: number,
  margin = 0.6,
): { ready: boolean; fraction: number } {
  const total = groups.reduce((s, g) => s + g.count, 0);
  if (completed >= total) return { ready: true, fraction: 1 };
  if (completed < Math.min(MIN_SAMPLES, total) || elapsedMs < MIN_ELAPSED_MS) {
    return { ready: false, fraction: 0 };
  }
  const rate = completed / elapsedMs; // 件/ms
  let cum = 0;
  let required = 0; // 今の時点で取り終えている必要がある件数
  for (const g of groups) {
    cum += g.count;
    const fetchableInTime = rate * Math.max(0, g.needAtMs) * margin;
    required = Math.max(required, cum - fetchableInTime);
  }
  if (completed >= required) return { ready: true, fraction: 1 };
  return { ready: false, fraction: Math.max(0, Math.min(0.99, completed / required)) };
}
