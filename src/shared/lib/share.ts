// ---------------------------------------------------------------------------
// Share URL builder — appends UTM parameters per sharing channel.
//
// Single source of truth for all outbound share URLs so PostHog attribution
// (utm_source → utm_medium → utm_campaign) is consistent across every share
// button variant. Used by ShareButton.tsx and the OG/download endpoints.
//
// NOTE: seo-eng creates an identical file on `p0-seo-foundation`. When that
// branch merges, this file will have a conflict that resolves trivially (same
// implementation). Keep this in sync with the spec §2.3 #13 contract.
// ---------------------------------------------------------------------------

export type ShareChannel =
  | 'x'
  | 'telegram'
  | 'whatsapp'
  | 'copy'
  | 'native'
  | 'stories';

const UTM_MEDIUM = 'passport_share';
const UTM_CAMPAIGN = 'cosmic_passport';

/**
 * Append UTM query params to a share URL.
 * Preserves any existing query params on `targetUrl`.
 *
 * @example
 * buildShareUrl('https://estrevia.app/s/abc123', 'x')
 * // → 'https://estrevia.app/s/abc123?utm_source=share_x&utm_medium=passport_share&utm_campaign=cosmic_passport'
 */
export function buildShareUrl(targetUrl: string, channel: ShareChannel): string {
  const url = new URL(targetUrl);
  url.searchParams.set('utm_source', `share_${channel}`);
  url.searchParams.set('utm_medium', UTM_MEDIUM);
  url.searchParams.set('utm_campaign', UTM_CAMPAIGN);
  return url.toString();
}
