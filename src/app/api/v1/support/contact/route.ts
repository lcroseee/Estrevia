import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { getCurrentUser } from '@/modules/auth/lib/helpers';
import { getSubscriptionDetails } from '@/modules/auth/lib/premium';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { sendSupportEmail } from '@/shared/lib/email';
import type { ApiResponse } from '@/shared/types';

const bodySchema = z.object({
  email: z.string().email().max(200),
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(5000),
});

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  // 1. Resolve auth (optional — anon users can also send, but with anon metadata)
  const user = await getCurrentUser();
  const userId = user?.userId ?? null;

  // 2. Rate limit (per userId if signed in, else per IP)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const limiterKey = userId ?? ip;
  const limiter = getRateLimiter('support/contact');
  const { success: rateLimitOk } = await limiter.limit(limiterKey);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  // 3. Parse body
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, data: null, error: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  // 4. Resolve subscription (for [PRIORITY] tag)
  let isPro = false;
  let plan = 'free';
  if (userId) {
    const sub = await getSubscriptionDetails(userId);
    isPro = sub.isPremium;
    plan = sub.plan;
  }

  // 5. Send email
  try {
    await sendSupportEmail({
      fromEmail: parsed.email,
      isPro,
      plan,
      subject: parsed.subject,
      message: parsed.message,
      userId,
    });
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[support/contact] send failed:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'SEND_FAILED' },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { success: true, data: { ok: true }, error: null },
    { status: 200 },
  );
}
