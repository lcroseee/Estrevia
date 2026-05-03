#!/usr/bin/env node
/**
 * Rasterises public/icons/icon.svg into PWA PNG icons.
 *
 * Outputs (under public/icons/):
 *   icon-192.png            — 192×192, transparent bg, full bleed
 *   icon-512.png            — 512×512, transparent bg, full bleed
 *   icon-maskable-192.png   — 192×192, brand bg, content fits in 80% safe zone
 *   icon-maskable-512.png   — 512×512, brand bg, content fits in 80% safe zone
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = path.join(ROOT, 'public/icons/icon.svg');
const OUT_DIR = path.join(ROOT, 'public/icons');
const BG = '#0A0A0F'; // matches public/manifest.json background_color

const svg = readFileSync(SOURCE);

async function renderAny(size) {
  await sharp(svg, { density: Math.max(72, size * 2) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, `icon-${size}.png`));
}

async function renderMaskable(size) {
  const innerSize = Math.round(size * 0.8); // 10% padding each side
  const inner = await sharp(svg, { density: Math.max(72, innerSize * 2) })
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, `icon-maskable-${size}.png`));
}

await Promise.all([renderAny(192), renderAny(512), renderMaskable(192), renderMaskable(512)]);
console.log('✓ Generated icon-192.png, icon-512.png, icon-maskable-192.png, icon-maskable-512.png');
