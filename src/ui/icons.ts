/** 固定のSVG素材（ユーザー入力は含まない） */

/** 白手袋の指差しアイコン（☝）。上向き、指先は (40.5, 6)。 */
export const FINGER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" width="120" height="200" aria-hidden="true">
  <g stroke="#17142b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <!-- 袖口 -->
    <path d="M32 156 L30 186 Q30 192 36 192 L82 192 Q88 192 88 186 L86 156 Z" fill="#ffffff"/>
    <path d="M34 170 H84 M34 180 H85" fill="none" stroke="#d6d1ec" stroke-width="2.5"/>
    <path d="M24 150 Q24 142 32 142 L88 142 Q96 142 96 150 L96 154 Q96 162 88 162 L32 162 Q24 162 24 154 Z" fill="#ffffff"/>
    <!-- 手のシルエット（人差し指＋握りこぶし） -->
    <path d="M27 21
             C 27 12 33 6 40.5 6
             C 48 6 54 12 54 21
             L 55 72
             C 62 69 68 69 72 71
             C 86 68 101 73 100 88
             C 102 97 99 103 95 106
             C 101 112 101 123 93 127
             C 98 134 95 144 85 146
             L 40 148
             C 26 148 18 139 18 126
             L 18 104
             C 18 93 22 86 27 82
             Z" fill="#ffffff"/>
    <!-- 陰（右側・下側） -->
    <path d="M86 140 C 92 138 94 132 90 128 M96 120 C 98 114 97 110 94 107 M98 96 C 99 90 97 84 92 80" fill="none" stroke="#dcd7f0" stroke-width="4"/>
    <path d="M49 22 L49.5 66" fill="none" stroke="#ebe8f8" stroke-width="5"/>
    <!-- 曲げた指の境目 -->
    <path d="M72 71 C 74 79 72 87 67 91" fill="none" stroke-width="3"/>
    <path d="M95 106 C 85 109 76 108 68 104" fill="none" stroke-width="3"/>
    <path d="M93 127 C 83 130 74 129 66 125" fill="none" stroke-width="3"/>
    <!-- 親指（曲げた指の上を斜めに横切る） -->
    <path d="M19 120 C 28 108 42 99 56 95 C 67 92 74 101 68 108 C 58 116 42 124 28 136" fill="#ffffff"/>
    <path d="M58 99 C 63 98 66 101 64 104" fill="none" stroke="#b9b3d6" stroke-width="2.5"/>
    <!-- 人差し指の関節 -->
    <path d="M34 44 Q 40.5 47 47 44" fill="none" stroke="#a49ec4" stroke-width="2.5"/>
    <path d="M34 50 Q 40.5 52 47 50" fill="none" stroke="#c6c1e0" stroke-width="2"/>
  </g>
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
