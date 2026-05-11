/**
 * One-off helper: upload 6 Story-format Canva PNGs to Vercel Blob at the
 * deterministic keys wired into seed-canva-anchor-creatives.ts. Idempotent
 * (allowOverwrite: true). Safe to delete after the 12-anchor seed lands.
 *
 * Spec: docs/superpowers/specs/2026-05-10-stories-reseed-design.md
 *
 * Usage:
 *   npx tsx scripts/advertising/upload-canva-stories-to-blob.ts
 *
 * Prerequisites:
 *   - 6 PNGs in tmp/canva-stories-2026-05-10/ matching UPLOAD_MAP keys.
 *   - BLOB_READ_WRITE_TOKEN set in .env.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { put } from '@vercel/blob';

const SOURCE_DIR = 'tmp/canva-stories-2026-05-10';

const UPLOAD_MAP: Record<string, string> = {
  'story_es_accuracy.png':  'advertising/canva-anchors/story_es_accuracy.png',
  'story_es_passport.png':  'advertising/canva-anchors/story_es_passport.png',
  'story_es_freechart.png': 'advertising/canva-anchors/story_es_freechart.png',
  'story_en_accuracy.png':  'advertising/canva-anchors/story_en_accuracy.png',
  'story_en_passport.png':  'advertising/canva-anchors/story_en_passport.png',
  'story_en_freechart.png': 'advertising/canva-anchors/story_en_freechart.png',
};

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is not set');
    process.exit(1);
  }

  const results: Record<string, string> = {};

  for (const [filename, blobKey] of Object.entries(UPLOAD_MAP)) {
    const filePath = join(SOURCE_DIR, filename);
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch (err) {
      console.error(`Missing PNG: ${filePath}`);
      process.exit(1);
    }
    const { url } = await put(blobKey, buffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
    });
    results[filename] = url;
    console.log(`  ✓ ${filename} → ${url}`);
  }

  console.log('\nUploaded URLs:');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
