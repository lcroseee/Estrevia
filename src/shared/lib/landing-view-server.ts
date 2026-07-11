import 'server-only';
import { cookies } from 'next/headers';
import { trackServerEvent } from '@/shared/lib/analytics';
import { ANONYMOUS_ID_COOKIE } from '@/shared/lib/anonymous-id';

/**
 * Server-side landing_view — the relaunch reconciler guardrail (audit LAND-4/PH-3).
 * The client LandingViewTracker only fires post-consent (~41% of converting
 * visitors); this captures every landing render, consent-independent.
 * Distinguish in PostHog: server rows have $lib='posthog-node' + source:'server'.
 *
 * Fire-and-forget: analytics must NEVER block or fail the landing render —
 * trackServerEvent already flushes via waitUntil; this wrapper adds a
 * catch-all so cookie/init errors degrade to a warn.
 */
export async function captureServerLandingView(locale: 'en' | 'es'): Promise<void> {
  try {
    const jar = await cookies();
    const distinctId = jar.get(ANONYMOUS_ID_COOKIE)?.value ?? crypto.randomUUID();
    trackServerEvent(distinctId, 'landing_view', { locale, source: 'server' });
  } catch (err) {
    console.warn('[landing-view-server] capture failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
