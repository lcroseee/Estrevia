/**
 * POST /api/v1/avatar/portrait
 *
 * Selfie-referenced Cosmic Portrait generation. Pro-only, palette locked by
 * the proprietary 777 correspondences. Two Gemini calls: pass 1 (vision)
 * analyses the uploaded selfie for safety + appearance traits, pass 2
 * (image) renders the portrait conditioned on those traits and the chart's
 * astrological signature.
 *
 * PII: the uploaded selfie is never logged, never written to disk, never
 * placed in a URL, and never persisted — only the AI-generated portrait
 * (Blob, `access: 'private'`) and chart-derived data (palette, scale) are
 * stored. See `avatars` table comment in schema.ts (design spec D8).
 */

import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { isPremium } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { checkAndIncrementUsage, decrementUsage } from '@/shared/lib/usage';
import { getDb } from '@/shared/lib/db';
import { redis } from '@/shared/lib/redis';
import { avatars, natalCharts } from '@/shared/lib/schema';
import { GeminiImageClient, GeminiVisionClient } from '@/shared/lib/gemini';
import { generatePassport } from '@/modules/astro-engine/passport';
import { buildPortraitPrompt } from '@/modules/astro-engine/portrait-prompt';
import { portraitRequestSchema, selfieAnalysisSchema } from '@/shared/validation/portrait';
import type { SelfieAnalysis } from '@/shared/validation/portrait';
import {
  isPortraitEnabled,
  checkDailyBudget,
  consumeDailyBudget,
  type BudgetRedis,
} from '@/shared/lib/portrait-guards';
import { MAX_UPLOAD_BYTES } from '@/shared/lib/image-prep';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';

export const maxDuration = 60;

const QUOTA_FEATURE = 'avatar_portrait';
const QUOTA_LIMIT = 30;

/**
 * Instructs pass 1 (vision) to return safety verdict + appearance traits +
 * prose in a single call, matching `selfieAnalysisSchema` exactly. Traits
 * describe appearance only — never race, ethnicity, or nationality.
 */
const VISION_ANALYSIS_PROMPT = `You are checking a selfie upload for a "Cosmic Portrait" art generator. Respond with strict JSON matching this shape:
{
  "safe": boolean,
  "reasons": string[], // subset of ["no_face","multiple_faces","likely_minor","nsfw","not_a_photo","low_quality"], empty when safe
  "traits": {
    "hair": { "texture": string, "length": string, "colour": string, "style": string },
    "face": { "shape": string, "jaw": string, "brows": string },
    "skinTone": string,
    "facialHair"?: string,
    "glasses"?: boolean,
    "distinguishing"?: string[]
  },
  "prose": string // one or two sentences describing pose and expression; no colour words
}
Set safe:false when the photo shows no clear single face, more than one face, a person who appears to be a minor, nudity or sexual content, is not a real photograph (e.g. a drawing, avatar, or screenshot), or is too low quality to make out features — and list every applicable reason. Describe appearance only, never race, ethnicity, or nationality.`;

/** Small local accessor over the shared Upstash Redis client — satisfies BudgetRedis (get/incr/expire). */
function getBudgetRedis(): BudgetRedis {
  return redis;
}

function fail(error: string, status: number, data: unknown = null) {
  return NextResponse.json({ success: false, data, error }, { status });
}

/**
 * JPEG FF D8 FF · PNG 89 50 4E 47 · WebP "RIFF"…"WEBP".
 *
 * JPEG/PNG are checked against their own (3-4 byte) signature prefix without
 * a length floor — a 12-byte minimum would wrongly reject a short-but-valid
 * JPEG buffer. Only the WebP branch, which reads bytes 8-12, needs the length
 * guard, and only immediately before that read.
 */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.length < 12) return false;
  return buf.subarray(0, 4).toString('ascii') === 'RIFF'
      && buf.subarray(8, 12).toString('ascii') === 'WEBP';
}

/** Short human-readable "why this portrait" string. Returned, never stored. */
function buildTraitsSummary(analysis: SelfieAnalysis, sunSign: string, rulingPlanet: string): string {
  const t = analysis.traits;
  return `${sunSign} Sun styled through ${t.hair.texture} ${t.hair.colour} hair and a ${t.face.shape} face, rendered in the ${rulingPlanet}-ruled 777 palette.`;
}

export async function POST(request: Request) {
  const t0 = Date.now();

  // ---------------------------------------------------------------------
  // 1. Auth — requireAuth() throws a Response on 401; catch and forward it
  //    rather than letting it become an uncaught-exception 500.
  // ---------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  if (!(await isPremium(userId))) return fail('PRO_REQUIRED', 402);
  if (!isPortraitEnabled()) return fail('FEATURE_DISABLED', 503);

  const { success: allowed } = await getRateLimiter('avatar/portrait').limit(userId);
  if (!allowed) return fail('RATE_LIMITED', 429);

  if (!(await checkDailyBudget(getBudgetRedis()))) return fail('BUDGET_EXCEEDED', 503);

  const usage = await checkAndIncrementUsage(userId, QUOTA_FEATURE, 'month', QUOTA_LIMIT);
  if (!usage.allowed) return fail('QUOTA_EXCEEDED', 402, { used: usage.count, limit: usage.limit });

  // Everything past this point must refund before returning a failure.
  const refundUsage = async () => {
    try {
      await decrementUsage(userId, QUOTA_FEATURE, 'month');
    } catch {
      // A failed refund must never mask the original error.
    }
  };

  // Set true immediately after the `avatars` insert succeeds. Once the
  // portrait is generated, written to Blob, and recorded in the DB, the
  // generation is done — the outer catch must not refund a quota unit for
  // a portrait that actually exists.
  let persisted = false;

  try {
    // -----------------------------------------------------------------
    // 7. Parse + validate the multipart request fields.
    // -----------------------------------------------------------------
    const formData = await request.formData();
    const parsedReq = portraitRequestSchema.safeParse({
      presentation: formData.get('presentation'),
      style: formData.get('style'),
      chartId: formData.get('chartId'),
    });
    if (!parsedReq.success) {
      await refundUsage();
      const failingField = parsedReq.error.issues[0]?.path[0];
      if (failingField === 'style') return fail('STYLE_NOT_PORTRAIT_CAPABLE', 400);
      return fail('INVALID_REQUEST', 400);
    }
    const { presentation, chartId } = parsedReq.data;

    // -----------------------------------------------------------------
    // 8. Read the selfie bytes and verify they are actually an image.
    //    Never logged, never written to disk or Blob, never in a URL.
    // -----------------------------------------------------------------
    const file = formData.get('file');
    if (!(file instanceof Blob)) {
      await refundUsage();
      return fail('INVALID_IMAGE', 400);
    }
    const selfieBuffer = Buffer.from(await file.arrayBuffer());
    if (selfieBuffer.byteLength > MAX_UPLOAD_BYTES || !looksLikeImage(selfieBuffer)) {
      await refundUsage();
      return fail('INVALID_IMAGE', 400);
    }
    const selfieMimeType = file.type || 'image/jpeg';

    // -----------------------------------------------------------------
    // 9. Load the chart (scoped to this user) and derive signs. There are
    //    no sign columns on natal_charts — only chartData: jsonb<ChartResult>.
    // -----------------------------------------------------------------
    const db = getDb();
    const chartRows = await db
      .select({ chartData: natalCharts.chartData })
      .from(natalCharts)
      .where(and(eq(natalCharts.id, chartId), eq(natalCharts.userId, userId)))
      .limit(1);
    if (chartRows.length === 0) {
      await refundUsage();
      return fail('CHART_NOT_FOUND', 404);
    }

    let passport;
    try {
      passport = generatePassport(chartRows[0].chartData);
    } catch {
      // generatePassport throws when the chart has no Sun position.
      await refundUsage();
      return fail('CHART_UNREADABLE', 502);
    }

    // -----------------------------------------------------------------
    // 10. Pass 1 — vision analysis (safety + traits + prose). Inline bytes
    //     only; the selfie is never fetched from or uploaded to a URL.
    // -----------------------------------------------------------------
    const visionClient = new GeminiVisionClient({ apiKey: process.env.GEMINI_API_KEY! });
    let visionResult;
    try {
      visionResult = await visionClient.analyzeImage(
        { data: selfieBuffer.toString('base64'), mimeType: selfieMimeType },
        VISION_ANALYSIS_PROMPT,
      );
    } catch {
      await refundUsage();
      return fail('ANALYSIS_FAILED', 502);
    }
    const analysisParsed = selfieAnalysisSchema.safeParse(visionResult.json);
    if (!analysisParsed.success) {
      await refundUsage();
      return fail('ANALYSIS_FAILED', 502);
    }
    const analysis = analysisParsed.data;

    if (!analysis.safe) {
      await refundUsage();
      trackServerEvent(userId, AnalyticsEvent.AVATAR_PORTRAIT_REJECTED, {
        reasons: analysis.reasons,
        latency_ms: Date.now() - t0,
      });
      return fail('UNSAFE_IMAGE', 422, { reasons: analysis.reasons });
    }

    // -----------------------------------------------------------------
    // 11. Compose the prompt — palette/symbols locked from 777 correspondences.
    // -----------------------------------------------------------------
    const built = buildPortraitPrompt({
      sunSign: passport.sunSign,
      moonSign: passport.moonSign,
      ascendantSign: passport.ascendantSign,
      rulingPlanet: passport.rulingPlanet,
      presentation,
      analysis,
    });

    // -----------------------------------------------------------------
    // 12. Pass 2 — image generation conditioned on the selfie + prompt.
    // -----------------------------------------------------------------
    const imageClient = new GeminiImageClient({ apiKey: process.env.GEMINI_API_KEY! });
    let generated;
    try {
      generated = await imageClient.generateFromImage({
        prompt: built.prompt,
        image: { data: selfieBuffer.toString('base64'), mimeType: selfieMimeType },
      });
    } catch {
      await refundUsage();
      return fail('GENERATION_FAILED', 502);
    }

    // -----------------------------------------------------------------
    // 13. Store the GENERATED portrait (never the selfie) — private Blob.
    // -----------------------------------------------------------------
    const blob = await put(`avatars/${userId}/${nanoid()}.jpg`, generated.buffer, {
      access: 'private',
      contentType: generated.mimeType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // -----------------------------------------------------------------
    // 14. Persist chart-derived data only — palette + scale, never traits.
    // -----------------------------------------------------------------
    const avatarId = nanoid();
    await db.insert(avatars).values({
      id: avatarId,
      userId,
      mode: 'portrait',
      style: 'cosmic',
      presentation,
      scale: built.scale,
      blobPathname: blob.pathname,
      palette: built.palette,
    });
    persisted = true;

    // -----------------------------------------------------------------
    // 15. Consume the daily budget and record success. Best-effort: the
    //     portrait is already generated and persisted, so a failure here
    //     must never turn a completed generation into a 500 (or, via the
    //     outer catch, an unwarranted refund).
    // -----------------------------------------------------------------
    try {
      await consumeDailyBudget(getBudgetRedis());
      trackServerEvent(userId, AnalyticsEvent.AVATAR_PORTRAIT_GENERATED, {
        scale: built.scale,
        sun_sign: passport.sunSign,
        moon_sign: passport.moonSign,
        latency_ms: Date.now() - t0,
      });
    } catch {
      // Best-effort — the portrait already exists; don't fail the request.
    }

    // -----------------------------------------------------------------
    // 16. Response — never echoes the selfie or any face-derived trait text.
    // -----------------------------------------------------------------
    return NextResponse.json({
      success: true,
      data: {
        id: avatarId,
        url: blob.url,
        palette: built.palette,
        scale: built.scale,
        traitsSummary: buildTraitsSummary(analysis, passport.sunSign, passport.rulingPlanet),
      },
      error: null,
    });
  } catch (err) {
    if (!persisted) {
      await refundUsage();
    }
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[avatar/portrait] error:', err);
    }
    // Never place the selfie, its bytes, or its filename into a log or a
    // Sentry tag — it is PII.
    return fail('INTERNAL_ERROR', 500);
  }
}
