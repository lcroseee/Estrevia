/**
 * GET /api/cron/notifications
 *
 * Vercel Cron — runs every hour.
 * Checks for moon phase changes and sends push notifications to subscribed users.
 *
 * Protected by CRON_SECRET (Vercel sends Bearer token in Authorization header).
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { getDb } from '@/shared/lib/db';
import {
  pushSubscriptions,
  notificationPreferences,
} from '@/shared/lib/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // ---------------------------------------------------------------------------
  // 1. Verify cron secret
  // ---------------------------------------------------------------------------
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ---------------------------------------------------------------------------
  // 2. Configure web-push VAPID
  // ---------------------------------------------------------------------------
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    console.error('[cron/notifications] VAPID keys not configured');
    return NextResponse.json(
      { success: false, error: 'VAPID_NOT_CONFIGURED', sent: 0 },
      { status: 500 },
    );
  }

  webpush.setVapidDetails(
    'mailto:notifications@estrevia.app',
    vapidPublic,
    vapidPrivate,
  );

  // ---------------------------------------------------------------------------
  // 3. Determine which notifications to send
  // ---------------------------------------------------------------------------
  // TODO: Implement full notification logic:
  // 1. Get current moon phase from astro-engine
  // 2. Check if phase changed since last check (store in Redis)
  // 3. Query users with matching preferences (fullNewMoon, dailyMoonPhase, etc.)
  // 4. Send push notifications via web-push
  //
  // For now, this is a placeholder that validates the cron infrastructure works.

  let sent = 0;

  try {
    const db = getDb();

    // Example: find users with fullNewMoon enabled (skeleton for future logic)
    const _subscribers = await db
      .select({
        userId: notificationPreferences.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(notificationPreferences)
      .innerJoin(
        pushSubscriptions,
        eq(notificationPreferences.userId, pushSubscriptions.userId),
      )
      .where(eq(notificationPreferences.fullNewMoon, true));

    // TODO: Check actual moon phase and send notifications
    // For each subscriber:
    //   await webpush.sendNotification(
    //     { endpoint, keys: { p256dh, auth } },
    //     JSON.stringify({ title: '...', body: '...', url: '/moon', tag: 'moon-phase' })
    //   );
    //   sent++;

    void _subscribers; // suppress unused warning until logic is implemented
  } catch (err) {
    console.error('[cron/notifications] error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', sent },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, sent });
}
