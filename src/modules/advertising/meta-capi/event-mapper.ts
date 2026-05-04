import type { EstreviaEvent } from './types';

export interface MappedEvent {
  /** Meta Pixel event name. `null` = do not fire client-side. */
  pixel: string | null;
  /** Meta CAPI event name. `null` = do not fire server-side. */
  capi: string | null;
}

/**
 * Canonical mapping from Estrevia internal events to Meta standard events.
 *
 * Notes per spec:
 * - `landing_view`: Pixel auto-tracks PageView; we don't manually fire CAPI for it
 *   because volume is huge and Meta already gets it from the script.
 * - `subscription_started`: server-side only (Stripe webhook is the source of
 *   truth); no client-side Pixel because the success page redirect doesn't
 *   reliably load the Pixel script.
 * - `passport_reshared`: custom 'Share' event (not in Meta's standard catalogue
 *   but accepted as a custom_event_type).
 */
export const MAPPING_TABLE: Record<EstreviaEvent, MappedEvent> = {
  landing_view: { pixel: 'PageView', capi: null },
  chart_calculated: { pixel: 'ViewContent', capi: 'ViewContent' },
  passport_reshared: { pixel: 'Share', capi: 'Share' },
  user_registered: { pixel: 'Lead', capi: 'Lead' },
  paywall_opened: { pixel: 'InitiateCheckout', capi: 'InitiateCheckout' },
  subscription_started: { pixel: null, capi: 'Subscribe' },
};

export function mapEstreviaToMeta(event: EstreviaEvent): MappedEvent {
  return MAPPING_TABLE[event];
}
