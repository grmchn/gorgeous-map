/** 固定のSVG素材（ユーザー入力は含まない） */

/**
 * 指差しアイコン（左向き・フラット）。ユーザー提供の見本の形を座標から写し取ったもの。
 * 表示サイズ 200×138、指先は要素左上から (4, 57) px。
 */
export const FINGER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 90 470 324" width="200" height="138" aria-hidden="true">
  <g stroke="#1b1b1b" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" fill="#fbe2da">
    <!-- 手の甲と親指 -->
    <path d="M222 198
             C 212 178 208 160 214 138
             C 220 116 238 102 260 102
             C 276 102 284 114 285 132
             C 287 156 294 172 314 184
             C 336 198 364 204 396 208
             L 400 378
             C 376 382 352 396 300 398
             L 240 398 L 240 252 Z"/>
    <!-- 人差し指（右端は手の甲に溶け込むので線を描かない） -->
    <path d="M222 196 L 58 196 A 28 28 0 0 0 58 252 L 252 252" fill="#fbe2da"/>
    <!-- 握った指（下から順に） -->
    <rect x="160" y="346" width="128" height="50" rx="25"/>
    <rect x="142" y="300" width="126" height="46" rx="23"/>
    <rect x="128" y="252" width="126" height="48" rx="24"/>
  </g>
  <!-- 人差し指の塗りで手の甲側の線を隠す -->
  <path d="M60 204 L 226 204 L 244 244 L 60 244 Z" fill="#fbe2da"/>
  <!-- 親指の付け根から手のひらへのしわ -->
  <path d="M222 198 C 230 228 244 252 262 262 C 276 270 288 276 298 284" fill="none" stroke="#1b1b1b" stroke-width="16" stroke-linecap="round"/>
  <!-- 袖口 -->
  <path d="M396 206 L 472 216 L 472 378 L 400 390 Z" fill="#ffffff" stroke="#1b1b1b" stroke-width="16" stroke-linejoin="round"/>
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
