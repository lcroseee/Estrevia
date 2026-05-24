import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z, ZodError } from 'zod';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getDb } from '@/shared/lib/db';
import { emailLeads } from '@/shared/lib/schema';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { sendLeadChartEmail } from '@/shared/lib/email';
import { assignPaywallTeaserVariant } from '@/shared/lib/abtest';
import { fetchTempChart } from '@/shared/lib/temp-chart';
import { STEP_0_TO_1_DELAY_MS } from '@/app/api/cron/lead-nurture/route';
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
  /** Meta `_fbc` cookie value verbatim — for CAPI ad-click attribution. */
  fbc: z.string().max(256).optional(),
  /** Meta `_fbp` cookie value verbatim — for cross-page Pixel dedupe. */
  fbp: z.string().max(256).optional(),
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
  // Assign A/B test variant deterministically at creation time.
  // Stored once; never changes. Pre-experiment leads (inserted before migration 0014)
  // have NULL variant and are excluded from experiment analysis.
  const paywallTeaserVariant = assignPaywallTeaserVariant(newId);

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
        paywallTeaserVariant,
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
    const referer = request.headers.get('referer') ?? undefined;
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
      // Attribution properties — extracted by analytics.ts:trackServerEvent into
      // CAPI user_data (fbc/fbp/IP/UA) and opts (event_source_url).
      fbc: input.fbc,
      fbp: input.fbp,
      client_ip_address: ip !== 'anonymous' ? ip : undefined,
      client_user_agent: userAgent ?? undefined,
      event_source_url: referer,
    });

    // T+0 nurture email — fire-and-forget via Vercel waitUntil so the API
    // response returns immediately (<200ms) while the email send (500-2000ms)
    // continues in the background. Errors are isolated; the hourly cron T+0
    // recovery branch picks up any stuck step=0 leads within 1h.
    const t0LeadId = leadId;
    const t0Email = input.email;
    const t0Locale = input.locale;
    const t0ChartId = input.chartId ?? null;
    waitUntil((async () => {
      try {
        const chart = await fetchTempChart(t0ChartId);
        const sendRes = await sendLeadChartEmail({
          leadId: t0LeadId,
          email: t0Email,
          locale: t0Locale,
          chart,
          chartId: t0ChartId,
        });
        if (sendRes.sent) {
          const db = getDb();
          await db
            .update(emailLeads)
            .set({
              nurtureStep: 1,
              nurtureNextAt: new Date(Date.now() + STEP_0_TO_1_DELAY_MS),
            })
            .where(eq(emailLeads.id, t0LeadId));
        }
      } catch (err) {
        try {
          const { captureException } = await import('@sentry/nextjs');
          captureException(err, { tags: { component: 'lead-nurture-t0', leadId: t0LeadId } });
        } catch {
          console.error('[leads/t0] send failed', {
            leadId: t0LeadId,
            err: err instanceof Error ? err.message : 'unknown',
          });
        }
      }
    })());
  }

  return NextResponse.json(
    { success: true, data: { leadId, eventId, wasNew }, error: null },
    { status: 200 },
  );
}
