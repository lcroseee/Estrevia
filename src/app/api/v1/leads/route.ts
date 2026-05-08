import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z, ZodError } from 'zod';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { emailLeads } from '@/shared/lib/schema';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { ApiResponse } from '@/shared/types';

export const runtime = 'nodejs';

interface LeadResponse {
  leadId: string;
  eventId: string;
  wasNew: boolean;
}

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  chartId: z.string().max(64).optional(),
  locale: z.enum(['en', 'es']).default('en'),
  utm_source: z.string().max(128).optional(),
  utm_medium: z.string().max(128).optional(),
  utm_campaign: z.string().max(128).optional(),
  utm_content: z.string().max(128).optional(),
  utm_term: z.string().max(128).optional(),
  anonymous_id: z.string().max(128).optional(),
});

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * POST /api/v1/leads
 *
 * Captures an anonymous email lead from the email-gate funnel after a
 * chart calc. Inserts ON CONFLICT DO NOTHING (email is UNIQUE) — second
 * submission of the same address returns wasNew=false and skips analytics.
 *
 * Security:
 *   - Rate-limited via the 'leads' bucket (10/h/IP)
 *   - IP is SHA-256 hashed before storage (never plaintext)
 *
 * Analytics:
 *   - Fires `email_lead_submitted` server-side only when wasNew=true
 *   - $insert_id = `${leadId}:email_lead_submitted` for client/server dedupe
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse<LeadResponse>>> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';

  const limiter = getRateLimiter('leads');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, data: null, error: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, data: null, error: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    throw err;
  }

  const userAgent = request.headers.get('user-agent') ?? null;
  const ipHash = ip === 'anonymous' ? null : sha256(ip);
  const newId = nanoid();

  let leadId: string;
  let wasNew: boolean;

  try {
    const db = getDb();
    const inserted = await db
      .insert(emailLeads)
      .values({
        id: newId,
        email: input.email,
        chartId: input.chartId ?? null,
        locale: input.locale,
        source: 'hero_calculator',
        utmSource: input.utm_source ?? null,
        utmMedium: input.utm_medium ?? null,
        utmCampaign: input.utm_campaign ?? null,
        utmContent: input.utm_content ?? null,
        utmTerm: input.utm_term ?? null,
        anonymousId: input.anonymous_id ?? null,
        ipAddressHash: ipHash,
        userAgent,
      })
      .onConflictDoNothing({ target: emailLeads.email })
      .returning({ id: emailLeads.id });

    if (inserted.length > 0) {
      leadId = inserted[0]!.id;
      wasNew = true;
    } else {
      const existing = await db
        .select({ id: emailLeads.id })
        .from(emailLeads)
        .where(eq(emailLeads.email, input.email));
      if (existing.length === 0) {
        return NextResponse.json(
          { success: false, data: null, error: 'DATABASE_ERROR' },
          { status: 500 },
        );
      }
      leadId = existing[0]!.id;
      wasNew = false;
    }
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[leads] db error:', err);
    }
    return NextResponse.json(
      { success: false, data: null, error: 'DATABASE_ERROR' },
      { status: 500 },
    );
  }

  const eventId = `${leadId}:email_lead_submitted`;

  if (wasNew) {
    const distinctId = input.anonymous_id ?? `lead_${leadId}`;
    trackServerEvent(distinctId, AnalyticsEvent.EMAIL_LEAD_SUBMITTED, {
      email: input.email,
      $insert_id: eventId,
      utm_source: input.utm_source,
      utm_medium: input.utm_medium,
      utm_campaign: input.utm_campaign,
      utm_content: input.utm_content,
      utm_term: input.utm_term,
      source: 'hero_calculator',
      locale: input.locale,
    });
  }

  return NextResponse.json(
    { success: true, data: { leadId, eventId, wasNew }, error: null },
    { status: 200 },
  );
}
