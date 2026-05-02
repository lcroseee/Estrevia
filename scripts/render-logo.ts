// Renders the Estrevia logo as a 1024×1024 PNG suitable for the Meta App icon,
// FB Page profile, app stores, and OG fallback. Brand-aligned with
// public/icons/icon.svg but more contrast + a wordmark beneath the wheel.
import sharp from 'sharp';
import { writeFile } from 'fs/promises';

// Brand
const BG = '#0A0A0F';        // Deep Space
const GOLD = '#D4B45C';      // Slightly brighter than C8A84B for small-size legibility
const GOLD_DIM = '#7A6532';
const SILVER = '#C0C0E0';
const MARS = '#E04040';
const SKY = '#A8D8EA';

const SIZE = 1024;
const CX = SIZE / 2;
const CY = 460;              // wheel center pulled up to leave room for wordmark
const R_OUTER = 380;
const R_MID = 290;
const R_INNER = 110;
const R_SUN = 28;

// 12 zodiac sectors — thin radial ticks between R_MID and R_OUTER.
const sectorTicks = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2; // start at 12 o'clock
  const x1 = CX + Math.cos(a) * R_MID;
  const y1 = CY + Math.sin(a) * R_MID;
  const x2 = CX + Math.cos(a) * R_OUTER;
  const y2 = CY + Math.sin(a) * R_OUTER;
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${GOLD}" stroke-width="2" opacity="0.85"/>`;
}).join('\n  ');

// Cardinal axis lines (ASC/DESC, MC/IC) — extra prominent.
const axes = `
  <line x1="${CX - R_OUTER - 30}" y1="${CY}" x2="${CX + R_OUTER + 30}" y2="${CY}" stroke="${GOLD}" stroke-width="1.5" opacity="0.4"/>
  <line x1="${CX}" y1="${CY - R_OUTER - 30}" x2="${CX}" y2="${CY + R_OUTER + 30}" stroke="${GOLD}" stroke-width="1.5" opacity="0.4"/>`;

// Planet dots at cardinal points
const planets = `
  <circle cx="${CX}"               cy="${CY - R_OUTER}" r="9" fill="${SILVER}"/>
  <circle cx="${CX + R_OUTER}"     cy="${CY}"           r="9" fill="${GOLD}"/>
  <circle cx="${CX}"               cy="${CY + R_OUTER}" r="9" fill="${MARS}"/>
  <circle cx="${CX - R_OUTER}"     cy="${CY}"           r="9" fill="${SKY}"/>`;

// Sun glyph at center (filled with inner hole — alchemical sun symbol)
const sunGlyph = `
  <circle cx="${CX}" cy="${CY}" r="${R_SUN}" fill="${GOLD}"/>
  <circle cx="${CX}" cy="${CY}" r="${R_SUN / 2}" fill="${BG}"/>`;

const wordmark = `
  <text x="${CX}" y="900"
        text-anchor="middle"
        font-family="Crimson Pro, Times New Roman, serif"
        font-size="120"
        font-weight="500"
        letter-spacing="22"
        fill="${GOLD}">
    ESTREVIA
  </text>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="46%" r="60%">
      <stop offset="0%"   stop-color="#16161E"/>
      <stop offset="60%"  stop-color="${BG}"/>
      <stop offset="100%" stop-color="#04040A"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bgGlow)"/>

  <!-- Outer chart wheel -->
  <circle cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="none" stroke="${GOLD}" stroke-width="4" opacity="0.95"/>
  <circle cx="${CX}" cy="${CY}" r="${R_MID}"   fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.55"/>
  <circle cx="${CX}" cy="${CY}" r="${R_INNER}" fill="none" stroke="${GOLD_DIM}" stroke-width="1.5" opacity="0.7"/>

  ${sectorTicks}
  ${axes}
  ${planets}
  ${sunGlyph}
  ${wordmark}
</svg>`;

async function main() {
  // Save the source SVG too — useful for high-DPI / vector use cases.
  await writeFile('estrevia-logo.svg', svg, 'utf-8');

  // 1024×1024 PNG — Meta App icon, FB Page, OG fallback.
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(SIZE, SIZE)
    .png({ compressionLevel: 9 })
    .toFile('estrevia-logo.png');

  // Also a 512×512 cropped square (icon-only, no wordmark) for favicon /
  // monochrome contexts. We re-render at smaller viewBox by adjusting CY.
  const iconOnlyBg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="60%">
      <stop offset="0%"   stop-color="#16161E"/>
      <stop offset="60%"  stop-color="${BG}"/>
      <stop offset="100%" stop-color="#04040A"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bgGlow)"/>
  <g transform="translate(0, 60)">
    <circle cx="512" cy="512" r="${R_OUTER}" fill="none" stroke="${GOLD}" stroke-width="4" opacity="0.95"/>
    <circle cx="512" cy="512" r="${R_MID}"   fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.55"/>
    <circle cx="512" cy="512" r="${R_INNER}" fill="none" stroke="${GOLD_DIM}" stroke-width="1.5" opacity="0.7"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x1 = 512 + Math.cos(a) * R_MID;
      const y1 = 512 + Math.sin(a) * R_MID;
      const x2 = 512 + Math.cos(a) * R_OUTER;
      const y2 = 512 + Math.sin(a) * R_OUTER;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${GOLD}" stroke-width="2" opacity="0.85"/>`;
    }).join('\n    ')}
    <line x1="${512 - R_OUTER - 30}" y1="512" x2="${512 + R_OUTER + 30}" y2="512" stroke="${GOLD}" stroke-width="1.5" opacity="0.4"/>
    <line x1="512" y1="${512 - R_OUTER - 30}" x2="512" y2="${512 + R_OUTER + 30}" stroke="${GOLD}" stroke-width="1.5" opacity="0.4"/>
    <circle cx="512" cy="${512 - R_OUTER}" r="9" fill="${SILVER}"/>
    <circle cx="${512 + R_OUTER}" cy="512" r="9" fill="${GOLD}"/>
    <circle cx="512" cy="${512 + R_OUTER}" r="9" fill="${MARS}"/>
    <circle cx="${512 - R_OUTER}" cy="512" r="9" fill="${SKY}"/>
    <circle cx="512" cy="512" r="${R_SUN}" fill="${GOLD}"/>
    <circle cx="512" cy="512" r="${R_SUN / 2}" fill="${BG}"/>
  </g>
</svg>`;

  await writeFile('estrevia-icon.svg', iconOnlyBg, 'utf-8');
  await sharp(Buffer.from(iconOnlyBg), { density: 300 })
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile('estrevia-icon.png');

  // Fallback formats for Meta App icon upload — Meta's uploader sometimes
  // chokes on RGBA PNGs. Provide a flat RGB JPG and a smaller 512×512 PNG.
  await sharp(Buffer.from(iconOnlyBg), { density: 300 })
    .resize(1024, 1024)
    .flatten({ background: BG })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile('estrevia-icon-1024.jpg');

  await sharp(Buffer.from(iconOnlyBg), { density: 300 })
    .resize(512, 512)
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toFile('estrevia-icon-512.png');

  // Maximum-compatibility "vanilla" JPG — explicit sRGB profile, baseline (not
  // progressive), no metadata. Last-resort if Meta uploader rejects the others.
  await sharp(Buffer.from(iconOnlyBg), { density: 300 })
    .resize(1024, 1024)
    .flatten({ background: BG })
    .toColorspace('srgb')
    .withMetadata({ density: 72 })
    .jpeg({ quality: 90, progressive: false, chromaSubsampling: '4:4:4' })
    .toFile('estrevia-icon-vanilla.jpg');

  console.log('Wrote variants:');
  console.log('  estrevia-logo.png       (1024×1024, RGBA, wordmark)');
  console.log('  estrevia-icon.png       (1024×1024, RGBA, icon-only)');
  console.log('  estrevia-icon-1024.jpg  (1024×1024, RGB JPG — Meta App fallback)');
  console.log('  estrevia-icon-512.png   (512×512,   RGB PNG — smaller fallback)');
  console.log('SVG sources: estrevia-logo.svg, estrevia-icon.svg');
}

main().catch(e => { console.error(e); process.exit(1); });
