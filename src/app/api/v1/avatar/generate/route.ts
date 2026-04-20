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
import { checkAndIncrementUsage } from '@/shared/lib/usage';
import type { ApiResponse } from '@/shared/types';

const bodySchema = z.object({
  sunSign: z.string(),
  moonSign: z.string(),
  ascendantSign: z.string().optional(),
  element: z.string(),
  style: z.enum(['cosmic', 'tarot', 'geometric', 'nebula']).default('cosmic'),
});

// Element to color palette mapping
const ELEMENT_PALETTES: Record<string, string> = {
  Fire: 'warm reds, oranges, and golds',
  Earth: 'deep greens, browns, and amber',
  Air: 'light blues, silvers, and whites',
  Water: 'deep blues, purples, and teals',
};

// Style to prompt template mapping
const STYLE_PROMPTS: Record<string, string> = {
  cosmic:
    'Cosmic energy portrait, ethereal starfield, nebula textures, flowing light',
  tarot:
    'Mystical tarot card art style, ornate borders, symbolic imagery, illuminated manuscript feel',
  geometric:
    'Sacred geometry patterns, precise mathematical forms, golden ratio spirals, crystalline structures',
  nebula:
    'Deep space nebula, swirling cosmic gases, stellar birth, vast cosmic scale',
};

interface AvatarGenerateResponse {
  imageBase64: string;
  mimeType: string;
  style: string;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<AvatarGenerateResponse>>> {
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

  if (!userIsPremium) {
    const usage = await checkAndIncrementUsage(userId, 'avatar', 'month', 3);
    if (!usage.allowed) {
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
  }

  // ---------------------------------------------------------------------------
  // 3. Parse & validate body
  // ---------------------------------------------------------------------------
  let parsed: z.infer<typeof bodySchema>;
  try {
    const body = await request.json();
    const result = bodySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, data: null, error: 'INVALID_INPUT' },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_INPUT' },
      { status: 400 },
    );
  }

  // Free users are restricted to 'cosmic' style — override silently
  const style = userIsPremium ? parsed.style : 'cosmic';
  const { sunSign, moonSign, element, ascendantSign } = parsed;

  // ---------------------------------------------------------------------------
  // 4. Build Imagen prompt
  // ---------------------------------------------------------------------------
  const palette = ELEMENT_PALETTES[element] ?? 'cosmic blues and purples';
  const stylePrompt = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.cosmic;
  const ascDesc = ascendantSign
    ? `, outer aura inspired by ${ascendantSign}`
    : '';

  const prompt = `${stylePrompt}. Abstract cosmic avatar representing ${sunSign} solar energy with ${moonSign} lunar essence${ascDesc}. Color palette: ${palette}. Dark background (#0A0A0F). No text, no face, no human features. Square format, mystical and ethereal.`;

  // ---------------------------------------------------------------------------
  // 5. Call Gemini Imagen API
  // ---------------------------------------------------------------------------
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[avatar/generate] GEMINI_API_KEY not configured');
    return NextResponse.json(
      { success: false, data: null, error: 'GEMINI_NOT_CONFIGURED' },
      { status: 500 },
    );
  }

  try {
    // TODO: The Gemini Imagen endpoint may change. If using a newer model
    // (e.g. imagen-4.0-generate-preview), update the model name accordingly.
    // Consider switching to the @google/generative-ai SDK if it adds Imagen support.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
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
      return NextResponse.json(
        { success: false, data: null, error: 'NO_IMAGE_GENERATED' },
        { status: 502 },
      );
    }

    // TODO: Upload to Vercel Blob for persistent storage instead of returning
    // base64 inline. For now, the client displays as a data URI.
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

    return NextResponse.json(
      { success: false, data: null, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
