/** 固定のSVG素材（ユーザー入力は含まない） */

/**
 * 指差しアイコン（左向き・フラット）。ユーザー提供の SVG。
 * 表示サイズ 200×140、指先は要素左上から (4, 58) px。
 * id は1ページに複数置いても衝突しないよう外している。
 */
export const FINGER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140" viewBox="10 82 480 336" aria-hidden="true">
  <!-- Pure vector. Recolor the hand and cuff fills below. Each finger is a separate editable path. -->
  <g fill="#F9DDD6" stroke="#101010" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">
    <path d="
      M 214,191 H 61
      C 43,191 29,205 29,222
      C 29,239 43,253 61,253
      H 229 L 194,400 H 264
      C 326,400 365,387 400,365
      L 400,217
      C 354,204 320,203 295,181
      C 282,169 277,154 273,131
      C 270,113 269,101 257,101
      C 241,101 230,106 222,116
      C 208,133 207,160 214,191 Z"/>
    <path d="
      M 146,253 H 229
      C 243,253 254,264 254,277
      C 254,291 244,302 230,302
      H 159 C 142,302 128,290 128,274
      C 128,262 135,253 146,253 Z"/>
    <path d="
      M 160,302 H 244
      C 258,302 268,313 268,326
      C 268,339 258,350 244,350
      H 176 C 157,350 142,338 142,321
      C 142,310 149,302 160,302 Z"/>
    <path d="
      M 180,350 H 264
      C 278,350 288,361 288,375
      C 288,389 278,400 264,400
      H 195 C 176,400 162,386 162,369
      C 162,358 169,350 180,350 Z"/>
    <path d="M 214,191 C 219,215 226,239 243,249 C 261,260 279,269 297,278" fill="none"/>
  </g>
  <path d="M 400,201 L 468,215 V 370 L 400,381 Z" fill="#FFFFFF" stroke="#101010" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
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
