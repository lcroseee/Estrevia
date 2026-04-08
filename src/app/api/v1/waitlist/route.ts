import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/shared/lib/db';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { sendWelcomeEmail } from '@/shared/lib/email';

const WaitlistBody = z.object({
  email: z.email(),
  source: z.string().max(64).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const limiter = getRateLimiter('waitlist');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const { success } = await limiter.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  // ── Parse & validate ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = WaitlistBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid email address', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { email, source = 'organic' } = parsed.data;
  const db = getDb();

  // ── Check for duplicate (silent success — don't reveal existence) ─────────
  const existing = await db
    .select({ id: schema.waitlistEntries.id })
    .from(schema.waitlistEntries)
    .where(eq(schema.waitlistEntries.email, email))
    .limit(1);

  if (existing.length > 0) {
    // Return success so we don't leak which emails are registered
    return NextResponse.json({ success: true }, { status: 200 });
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  await db.insert(schema.waitlistEntries).values({ email, source });

  // ── Welcome email (best-effort — don't fail the request if Resend is down) ─
  if (process.env.RESEND_API_KEY) {
    try {
      await sendWelcomeEmail(email);
    } catch (err) {
      // Log but do not surface to client — user is already on the list
      console.error('[waitlist] Failed to send welcome email:', err);
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
