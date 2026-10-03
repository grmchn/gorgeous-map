// MapLibre の Web Worker。Vite で依存ごとバンドルし、setWorkerUrl() に渡す。
// maplibre-gl は dist/*.mjs を副作用なし（sideEffects）扱いにしているため、単に import すると
// バンドル時に Worker の初期化が消える。配布物の末尾と同じ初期化をここで明示的に行う。
import MaplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs';

const scope = self as unknown as { worker?: unknown };
scope.worker = new MaplibreWorker(self);
