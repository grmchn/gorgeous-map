/** 固定のSVG素材（ユーザー入力は含まない） */

/**
 * 指差しアイコン（左向き・フラット）。指先は要素左上から (6, 54) px。
 * 太い線→塗りの順に重ねて、外形だけに輪郭が出るようにしている。
 */
export const FINGER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 80 475 325" width="190" height="130" aria-hidden="true">
  <!-- 1回目：太い線だけ（外形の輪郭になる） -->
  <g fill="none" stroke="#1b1a1f" stroke-width="26" stroke-linejoin="round" stroke-linecap="round">
    <path d="M60 186 L214 186 C212 150 218 112 244 100 C266 90 286 104 286 128 C286 156 296 174 326 186 L398 198 L398 384 L282 390 L268 246 L60 246 A30 30 0 0 1 60 186 Z"/>
    <rect x="130" y="246" width="160" height="56" rx="28"/>
    <rect x="146" y="300" width="144" height="48" rx="24"/>
    <rect x="166" y="346" width="124" height="44" rx="22"/>
  </g>
  <!-- 2回目：塗りだけ（内側の線を消す） -->
  <g fill="#fbe1d8">
    <path d="M60 186 L214 186 C212 150 218 112 244 100 C266 90 286 104 286 128 C286 156 296 174 326 186 L398 198 L398 384 L282 390 L268 246 L60 246 A30 30 0 0 1 60 186 Z"/>
    <rect x="130" y="246" width="160" height="56" rx="28"/>
    <rect x="146" y="300" width="144" height="48" rx="24"/>
    <rect x="166" y="346" width="124" height="44" rx="22"/>
  </g>
  <!-- 内側の線（指の境目・親指のしわ） -->
  <g fill="none" stroke="#1b1a1f" stroke-width="13" stroke-linecap="round">
    <path d="M146 246 L250 246"/>
    <path d="M168 300 L274 300"/>
    <path d="M186 346 L274 346"/>
    <path d="M244 238 L302 270"/>
  </g>
  <!-- 袖口 -->
  <path d="M394 200 L470 190 L472 386 L396 382 Z" fill="#ffffff" stroke="#1b1a1f" stroke-width="13" stroke-linejoin="round"/>
</svg>`;

/** 指先の「ビシッ」（指した瞬間の衝撃線）。中心が指先。 */
export const POKE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100" aria-hidden="true">
  <g stroke="#ffd34d" stroke-width="6" stroke-linecap="round">
    <path d="M0 -22 V-44"/><path d="M-19 -13 L-36 -26"/><path d="M19 -13 L36 -26"/><path d="M-22 4 L-42 8"/><path d="M22 4 L42 8"/>
  </g>
  <g stroke="#17142b" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6">
    <path d="M0 -22 V-44"/><path d="M-19 -13 L-36 -26"/><path d="M19 -13 L36 -26"/><path d="M-22 4 L-42 8"/><path d="M22 4 L42 8"/>
  </g>
</svg>`;

/** 「ババーン！」の後ろの爆発形 */
export const BURST_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 124 84" class="burst" aria-hidden="true" preserveAspectRatio="none">
  <polygon points="60.0,1.0 68.2,15.7 84.9,4.9 85.8,18.0 105.0,15.7 93.2,29.2 116.1,31.3 101.4,40.0 116.1,48.7 93.2,50.8 105.0,64.3 85.8,62.0 84.9,75.1 68.2,64.3 60.0,79.0 50.8,67.4 35.1,75.1 37.1,59.5 15.0,64.3 22.7,52.2 3.9,48.7 23.2,40.0 3.9,31.3 22.7,27.8 15.0,15.7 37.1,20.5 35.1,4.9 50.8,12.6" fill="#ff2d55" stroke="#17142b" stroke-width="3.5" stroke-linejoin="round"/>
</svg>`;

/** 到着ピン。下端中央が地点。 */
export const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 84" width="56" height="74" aria-hidden="true">
  <defs>
    <linearGradient id="pinGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe680"/>
      <stop offset="0.5" stop-color="#ffb800"/>
      <stop offset="1" stop-color="#e07a00"/>
    </linearGradient>
  </defs>
  <path d="M32 81 C32 81 6 50 6 31 A26 26 0 0 1 58 31 C58 50 32 81 32 81 z" fill="#ff2d55" stroke="#17142b" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="32" cy="31" r="12" fill="url(#pinGold)" stroke="#17142b" stroke-width="3.5"/>
  <path d="M27 24 q4 -4 9 -2" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
</svg>`;

export const GLOBE_SPINNER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
  <circle cx="24" cy="24" r="20" fill="#2a54d6" stroke="#fff" stroke-width="2"/>
  <path d="M10 18 q8 -6 14 0 t12 2 q2 6 -4 9 t-10 6 q-6 -3 -10 -9z" fill="#4fd18b"/>
  <ellipse cx="24" cy="24" rx="20" ry="8" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.5"/>
</svg>`;
