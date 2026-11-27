// Draws Flick's icons: the sliced wheel with one orange (hovered) slice and a cursor arrow on it.
//   node scripts/make-icons.js      writes assets/icon.png (256 px) and assets/tray.png (32 px)
const path = require('path');
const sharp = require('sharp');

const rad = (d) => (d * Math.PI) / 180;

// one ring slice between radii rIn..rOut, centred on angle `mid`, `gap` px apart from its neighbours
function slice(cx, cy, rIn, rOut, mid, span, gap) {
  const p = (r, a) => `${(cx + r * Math.cos(rad(a))).toFixed(2)},${(cy + r * Math.sin(rad(a))).toFixed(2)}`;
  const po = ((gap / 2 / rOut) * 180) / Math.PI;
  const pi = ((gap / 2 / rIn) * 180) / Math.PI;
  const a0 = mid - span / 2;
  const a1 = mid + span / 2;
  return `M${p(rOut, a0 + po)} A${rOut},${rOut} 0 0 1 ${p(rOut, a1 - po)} L${p(rIn, a1 - pi)} A${rIn},${rIn} 0 0 0 ${p(rIn, a0 + pi)} Z`;
}

// the standard pointer, tip at (0,0), about 84 units tall
const ARROW = 'M0,0 L0,72 L17,56 L29,84 L42,78 L30,51 L52,51 Z';

function svg({ size, cx, cy, rim, rOut, rIn, well, hub, gap, round, hot, tip, arrowScale, arrowStroke }) {
  const slices = [-90, -30, 30, 90, 150, 210]
    .map((mid) => {
      const d = slice(cx, cy, rIn, rOut, mid, 60, gap);
      const fill = mid === hot ? 'url(#hot)' : '#f7f5f2';
      return `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="${round}" stroke-linejoin="round"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="hot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff9a5c"/><stop offset="1" stop-color="#e2561c"/>
    </linearGradient>
    <radialGradient id="rim" cx="0.5" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#4a433e"/><stop offset="1" stop-color="#262220"/>
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${rim}" fill="url(#rim)"/>
  ${slices}
  <circle cx="${cx}" cy="${cy}" r="${well}" fill="#262220"/>
  <circle cx="${cx}" cy="${cy}" r="${hub}" fill="#f2efeb"/>
  <path d="${ARROW}" transform="translate(${tip[0]},${tip[1]}) scale(${arrowScale})"
        fill="#ffffff" stroke="#151312" stroke-width="${arrowStroke / arrowScale}" stroke-linejoin="round"/>
</svg>`;
}

// the cursor tip rests on the orange slice (centred at 30°, lower right) and the arrow hangs off the wheel
const ICON = { size: 256, cx: 112, cy: 112, rim: 110, rOut: 101, rIn: 42, well: 40, hub: 32, gap: 11, round: 6, hot: 30, arrowScale: 1.05, arrowStroke: 7 };
ICON.tip = [ICON.cx + 62 * Math.cos(rad(30)), ICON.cy + 62 * Math.sin(rad(30))];

const TRAY = { size: 32, cx: 14, cy: 14, rim: 13.5, rOut: 12.5, rIn: 5.5, well: 5.2, hub: 4, gap: 2.4, round: 0.6, hot: 30, arrowScale: 0.19, arrowStroke: 1.3 };
TRAY.tip = [TRAY.cx + 8.5 * Math.cos(rad(30)), TRAY.cy + 8.5 * Math.sin(rad(30))];

async function main() {
  const out = process.argv[2] || path.join(__dirname, '..', 'assets');
  await sharp(Buffer.from(svg(ICON))).png().toFile(path.join(out, 'icon.png'));
  // the tray icon is drawn 4x and scaled down so the small shapes stay crisp
  const big = { ...TRAY, size: 128 };
  for (const k of ['cx', 'cy', 'rim', 'rOut', 'rIn', 'well', 'hub', 'gap', 'round', 'arrowScale', 'arrowStroke']) big[k] = TRAY[k] * 4;
  big.tip = TRAY.tip.map((v) => v * 4);
  await sharp(Buffer.from(svg(big))).resize(32, 32).png().toFile(path.join(out, 'tray.png'));
}

main();
