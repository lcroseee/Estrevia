/**
 * POST /api/v1/avatar/generate
 *
 * Generates an AI avatar based on natal chart data using Gemini Imagen API.
 * Auth required. Free: 1 generation, Pro: unlimited + style selection.
 *
 * Returns: { imageBase64, mimeType, style }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/modules/auth/lib/helpers';
import { isPremium } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { checkAndIncrementUsage, decrementUsage } from '@/shared/lib/usage';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { buildAvatarPrompt } from '@/modules/astro-engine/avatar-prompt';
import type { ApiResponse } from '@/shared/types';

const bodySchema = z.object({
  sunSign: z.string(),
  moonSign: z.string(),
  ascendantSign: z.string().optional(),
  element: z.string(),
  style: z.enum(['cosmic', 'tarot', 'geometric', 'nebula']).default('cosmic'),
});

interface AvatarGenerateResponse {
  imageBase64: string;
  mimeType: string;
  style: string;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<AvatarGenerateResponse>>> {
  const t0 = Date.now();
  // ---------------------------------------------------------------------------
  // 1. Auth
  // ---------------------------------------------------------------------------
  let userId: string;
  try {
    const user = await requireAuth();
    userId = user.userId;
  } catch (err) {
    if (err instanceof Response) return err as never;
    throw err;
  }

  // ---------------------------------------------------------------------------
  // 2. Rate limiting (avatar generation is expensive — 3 req/min)
  // ---------------------------------------------------------------------------
  const limiter = getRateLimiter('avatar/generate');
  const { success: rateLimitOk } = await limiter.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // ---------------------------------------------------------------------------
  // 2b. Tier check — free users get 3 generations/month and 'cosmic' style only
  // ---------------------------------------------------------------------------
  const userIsPremium = await isPremium(userId);
  const tier: 'free' | 'premium' = userIsPremium ? 'premium' : 'free';

  // Track whether we optimistically incremented the monthly counter so that
  // every downstream failure path can refund the user's quota. Without this,
  // a transient Gemini 5xx (or even a malformed-body 400) would burn one of
  // the user's 3 free generations even though no image was produced.
  let usageIncremented = false;
  const refundUsage = async () => {
    if (!usageIncremented) return;
    try {
      await decrementUsage(userId, 'avatar', 'month');
    } catch (refundErr) {
      console.error('[avatar/generate] usage refund failed:', refundErr);
    }
  };

  if (!userIsPremium) {
    const usage = await checkAndIncrementUsage(userId, 'avatar', 'month', 3);
    if (!usage.allowed) {
      trackServerEvent(userId, AnalyticsEvent.AVATAR_QUOTA_EXHAUSTED, {
        tier: 'free',
        limit: usage.limit,
        count: usage.count,
      });
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'FREE_LIMIT_REACHED',
          meta: { limit: usage.limit, count: usage.count, period: 'month' },
        },
        { status: 403 },
      );
    }
    usageIncremented = true;
  }

  // ---------------------------------------------------------------------------
  // 3. Parse & validate body
  // ---------------------------------------------------------------------------
  let parsed: z.infer<typeof bodySchema>;
  try {
    const body = await request.json();
    const result = bodySchema.safeParse(body);
    if (!result.success) {
      trackServerEvent(userId, AnalyticsEvent.AVATAR_GENERATION_FAILED, {
        error_code: 'INVALID_INPUT',
        tier,
        latency_ms: Date.now() - t0,
      });
      await refundUsage();
      return NextResponse.json(
        { success: false, data: null, error: 'INVALID_INPUT' },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    trackServerEvent(userId, AnalyticsEvent.AVATAR_GENERATION_FAILED, {
      error_code: 'INVALID_INPUT',
      tier,
      latency_ms: Date.now() - t0,
    });
    await refundUsage();
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_INPUT' },
      { status: 400 },
    );
  }

  // Free users are restricted to 'cosmic' style — override silently
  const style = userIsPremium ? parsed.style : 'cosmic';
  const { sunSign, moonSign, element, ascendantSign } = parsed;

  // ---------------------------------------------------------------------------
  // 4. Build Imagen prompt — delegates to a 777-correspondence-aware builder.
  //    See src/modules/astro-engine/avatar-prompt.ts for the full template.
  // ---------------------------------------------------------------------------
  const prompt = buildAvatarPrompt({
    sunSign,
    moonSign,
    ascendantSign,
    element,
    style,
  });

  // ---------------------------------------------------------------------------
  // 5. Call Gemini Imagen API
  // ---------------------------------------------------------------------------
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[avatar/generate] GEMINI_API_KEY not configured');
    trackServerEvent(userId, AnalyticsEvent.AVATAR_GENERATION_FAILED, {
      error_code: 'GEMINI_NOT_CONFIGURED',
      tier,
      latency_ms: Date.now() - t0,
    });
    await refundUsage();
    return NextResponse.json(
      { success: false, data: null, error: 'GEMINI_NOT_CONFIGURED' },
      { status: 500 },
    );
  }

  try {
    // Imagen 4 'fast' tier — Google retired imagen-3.0-generate-002 in favor of
    // imagen-4.0-* models (verified 2026-05-03 via ListModels). The 'fast' variant
    // matches our use case: stylized abstract avatars where ultra-quality is wasted,
    // and the per-call cost matters because free users get 3/mo and Pro is unlimited.
    // Response shape (predictions[0].{mimeType, bytesBase64Encoded}) is unchanged.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
            safetyFilterLevel: 'block_some',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[avatar/generate] Gemini API error:', errorText);
      trackServerEvent(userId, AnalyticsEvent.AVATAR_GENERATION_FAILED, {
        error_code: 'GENERATION_FAILED',
        tier,
        latency_ms: Date.now() - t0,
      });
      await refundUsage();
      return NextResponse.json(
        { success: false, data: null, error: 'GENERATION_FAILED' },
        { status: 502 },
      );
    }

    const data = await response.json();
    const imageBase64: string | undefined =
      data.predictions?.[0]?.bytesBase64Encoded;

    if (!imageBase64) {
      console.error('[avatar/generate] No image in Gemini response');
      trackServerEvent(userId, AnalyticsEvent.AVATAR_GENERATION_FAILED, {
        error_code: 'NO_IMAGE_GENERATED',
        tier,
        latency_ms: Date.now() - t0,
      });
      await refundUsage();
      return NextResponse.json(
        { success: false, data: null, error: 'NO_IMAGE_GENERATED' },
        { status: 502 },
      );
    }

    // TODO: Upload to Vercel Blob for persistent storage instead of returning
    // base64 inline. For now, the client displays as a data URI.
    trackServerEvent(userId, AnalyticsEvent.AVATAR_GENERATED, {
      style,
      tier,
      model: 'imagen-4.0-fast-generate-001',
      latency_ms: Date.now() - t0,
      sun_sign: sunSign,
      moon_sign: moonSign,
      has_ascendant: ascendantSign != null,
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          imageBase64,
          mimeType: 'image/png',
          style,
        },
        error: null,
      },
      { status: 200 },
    );
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[avatar/generate] error:', err);
    }

    trackServerEvent(userId, AnalyticsEvent.AVATAR_GENERATION_FAILED, {
      error_code: 'INTERNAL_ERROR',
      tier,
      latency_ms: Date.now() - t0,
    });
    await refundUsage();
    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
