/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_GEOCODER_URL?: string;
}

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs';
