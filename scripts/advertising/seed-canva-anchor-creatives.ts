/**
 * One-off seed: insert 12 Canva-generated brand-anchor creatives
 * (6 feed 1080x1350 + 6 stories 1080x1920) into advertising_creatives
 * as pre-approved evergreen records.
 *
 * Idempotent — uses fixed IDs so re-running is a no-op.
 *
 * Usage:
 *   npm run advertising:seed-canva-anchors           # real INSERT
 *   npm run advertising:seed-canva-anchors -- --dry-run   # preview only
 *
 * Prerequisites:
 *   - All 12 Canva PNGs uploaded to Vercel Blob (URLs in ANCHOR_BLOBS)
 *   - Patch 02 applied: 'lead_magnet' archetype + es/en-rarity-7 templates
 */

import 'dotenv/config';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import type { SafetyCheckResult } from '@/shared/types/advertising';

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL ?? 'founder@estrevia.app';
const APPROVED_AT = new Date('2026-05-10T00:00:00Z');

const PRE_APPROVED_CHECKS: SafetyCheckResult[] = [
  { check_name: 'personal_claim',       passed: true, severity: 'info', reason: 'Manual founder review — Brand Guidelines compliant' },
  { check_name: 'meta_ad_policy',       passed: true, severity: 'info', reason: 'Manual founder review' },
  { check_name: 'ocr_text_accuracy',    passed: true, severity: 'info', reason: 'Visually verified' },
  { check_name: 'brand_consistency',    passed: true, severity: 'info', reason: 'Generated against Canva Brand Kit kAGT_ANQrn8' },
  { check_name: 'controversial_symbol', passed: true, severity: 'info', reason: 'Manual founder review' },
];

const ANCHOR_BLOBS = {
  feed_es_accuracy:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_accuracy.png',
  feed_es_passport:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_passport.png',
  feed_es_freechart:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_es_freechart.png',
  feed_en_accuracy:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_accuracy.png',
  feed_en_passport:   'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_passport.png',
  feed_en_freechart:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/feed_en_freechart.png',
  story_es_accuracy:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_accuracy.png',
  story_es_passport:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_passport.png',
  story_es_freechart: 'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_es_freechart.png',
  story_en_accuracy:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_accuracy.png',
  story_en_passport:  'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_passport.png',
  story_en_freechart: 'https://zproaddipyjwfa81.public.blob.vercel-storage.com/advertising/canva-anchors/story_en_freechart.png',
} as const;

interface AnchorRecord {
  id: string;
  hookTemplateId: string;
  assetUrl: string;
  assetKind: 'image';
  generator: 'canva';
  costUsd: 0;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  status: 'approved';
  safetyChecks: SafetyCheckResult[];
  approvedBy: string;
  approvedAt: Date;
}

export const ANCHORS: AnchorRecord[] = [
  // ---- Feed (1080x1350) ----
  {
    id: 'anchor-2026-05-10-es-accuracy-feed',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.feed_es_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'No es horóscopo. Es tu carta natal real. Astrología sideral con precisión védica. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Descubre tu carta — gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-passport-feed',
    hookTemplateId: 'es-rarity-7',
    assetUrl: ANCHOR_BLOBS.feed_es_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Tu identidad sideral en una sola tarjeta. El Pasaporte Cósmico de Estrevia reúne tu Sol, Luna y Ascendente en signos reales — calculados con precisión védica. Compartible, precisa, tuya.',
    cta: 'Genera el tuyo gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-freechart-feed',
    hookTemplateId: 'es-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.feed_es_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calcula tu carta natal sideral sin costo. Precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Crear mi carta',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-accuracy-feed',
    hookTemplateId: 'en-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.feed_en_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: "Your real birth chart, calibrated to the actual sky — not the calendar's average. Sidereal astrology with Vedic precision (Lahiri ayanamsa, accurate to ±0.01° against the Swiss Ephemeris). No generic horoscopes, no predictions. A tool for reflection, not fortune-telling.",
    cta: 'See your chart — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-passport-feed',
    hookTemplateId: 'en-rarity-7',
    assetUrl: ANCHOR_BLOBS.feed_en_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Your sidereal identity, on a single card. The Estrevia Cosmic Passport gathers your Sun, Moon, and Ascendant in real signs — calculated with Vedic precision. Shareable, precise, yours.',
    cta: 'Generate yours — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-freechart-feed',
    hookTemplateId: 'en-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.feed_en_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calculate your sidereal birth chart, free. Vedic precision to ±0.01° against the Swiss Ephemeris. No sun-sign generalizations, no predictions — an honest look at your real sky.',
    cta: 'Create my chart',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  // ---- Stories (1080x1920) ----
  {
    id: 'anchor-2026-05-10-es-accuracy-stories',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.story_es_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'No es horóscopo. Es tu carta natal real. Astrología sideral con precisión védica. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Descubre tu carta — gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-passport-stories',
    hookTemplateId: 'es-rarity-7',
    assetUrl: ANCHOR_BLOBS.story_es_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Tu identidad sideral en una sola tarjeta. El Pasaporte Cósmico de Estrevia reúne tu Sol, Luna y Ascendente en signos reales — calculados con precisión védica. Compartible, precisa, tuya.',
    cta: 'Genera el tuyo gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-freechart-stories',
    hookTemplateId: 'es-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.story_es_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calcula tu carta natal sideral sin costo. Precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Crear mi carta',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-accuracy-stories',
    hookTemplateId: 'en-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.story_en_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: "Your real birth chart, calibrated to the actual sky — not the calendar's average. Sidereal astrology with Vedic precision (Lahiri ayanamsa, accurate to ±0.01° against the Swiss Ephemeris). No generic horoscopes, no predictions. A tool for reflection, not fortune-telling.",
    cta: 'See your chart — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-passport-stories',
    hookTemplateId: 'en-rarity-7',
    assetUrl: ANCHOR_BLOBS.story_en_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Your sidereal identity, on a single card. The Estrevia Cosmic Passport gathers your Sun, Moon, and Ascendant in real signs — calculated with Vedic precision. Shareable, precise, yours.',
    cta: 'Generate yours — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-freechart-stories',
    hookTemplateId: 'en-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.story_en_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calculate your sidereal birth chart, free. Vedic precision to ±0.01° against the Swiss Ephemeris. No sun-sign generalizations, no predictions — an honest look at your real sky.',
    cta: 'Create my chart',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
];

export async function seed(opts: { dryRun?: boolean } = {}): Promise<void> {
  const db = getDb();
  console.log(`Seeding ${ANCHORS.length} anchor creatives…`);
  if (opts.dryRun) {
    console.log('--- DRY RUN — no INSERT performed ---');
    console.log(JSON.stringify(ANCHORS, null, 2));
    return;
  }
  for (const anchor of ANCHORS) {
    await db
      .insert(advertisingCreatives)
      .values(anchor)
      .onConflictDoNothing();
    console.log(`  ✓ ${anchor.id}`);
  }
  console.log('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  seed({ dryRun }).catch((e) => { console.error(e); process.exit(1); });
}
