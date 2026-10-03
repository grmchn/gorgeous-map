/** 固定のSVG素材（ユーザー入力は含まない） */

/** 白手袋の指差しアイコン。上向き、指先は (46, 6)。 */
export const FINGER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 196" width="112" height="196" aria-hidden="true">
  <g stroke="#17142b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M22 150 h66 a7 7 0 0 1 7 7 v30 a7 7 0 0 1 -7 7 h-66 a7 7 0 0 1 -7 -7 v-30 a7 7 0 0 1 7 -7z" fill="#ffffff"/>
    <path d="M17 163 h76 M17 176 h76" fill="none" stroke-width="3" stroke="#c9c3e6"/>
    <path d="M28 82 c-10 0 -16 8 -16 18 v34 c0 11 8 18 18 18 h48 c13 0 22 -9 22 -22 v-28 c0 -12 -8 -20 -20 -20 z" fill="#ffffff"/>
    <path d="M33 92 V18 c0 -8 6 -13 13 -13 s13 5 13 13 V92" fill="#ffffff"/>
    <path d="M59 84 c13 -1 22 3 22 11 s-9 11 -22 10" fill="#ffffff"/>
    <path d="M60 105 c14 -1 24 3 24 11 s-10 11 -23 10" fill="#ffffff"/>
    <path d="M61 126 c12 -1 21 3 21 10 s-8 10 -20 9" fill="#ffffff"/>
    <path d="M34 108 c-12 -2 -22 4 -22 13 c0 9 10 14 24 12 l12 -2" fill="#ffffff"/>
    <path d="M40 30 v26" fill="none" stroke="#e4e0f5" stroke-width="4"/>
  </g>
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
