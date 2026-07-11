'use client';

/**
 * MetaPixelLoader — consent-gated Meta Pixel base snippet.
 *
 * Replaces the previously unconditional inline snippet in [locale]/layout.tsx
 * (LIVE-7: `_fbp` was set before consent and survived Decline while the
 * cookie banner claimed "no third-party tracking").
 *
 * Behavior:
 *  - consent 'accepted' (stored, or via the `estrevia:consent` event fired by
 *    CookieConsent) → mounts the standard fbq base snippet (init + PageView)
 *    without requiring navigation.
 *  - consent absent or 'declined' → renders nothing; on decline it also
 *    expires leftover `_fbp` / `_fbc` cookies set by older (un-gated) builds.
 *  - Revoking AFTER fbevents.js has loaded cannot unload it without a reload;
 *    the banner only offers one decision per visitor (it never re-shows once
 *    a value is stored), so the accept-then-decline path is unreachable via
 *    UI. Cookie expiry covers the old-build migration case.
 *
 * Attribution trade-off (spec D3): browser pixel events now undercount by
 * the consent-decline/ignore rate; server-side CAPI is unaffected. Relaunch
 * metrics use server `landing_view` as the denominator.
 *
 * Downstream fbq() emitters (MetaPixelLeadEmitter, MetaPixelSubscribeEmitter,
 * EmailGateModal, HeroCalculator, BirthDataForm) all guard on
 * `typeof fbq === 'function'` and degrade silently pre-consent.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getCookieConsent } from './PostHogProvider';
import type { CookieConsentValue } from './PostHogProvider';

interface MetaPixelLoaderProps {
  /** Meta Pixel id (NEXT_PUBLIC_META_PIXEL_ID). Empty string → render nothing. */
  pixelId: string;
}

/**
 * Expire `_fbp` / `_fbc` on both the host-only and dotted-root-domain
 * variants — fbevents.js sets them on the registrable domain
 * (e.g. `.estrevia.app`), while dev/tests run on bare `localhost`.
 */
function expireMetaCookies(): void {
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const rootDomain = window.location.hostname.replace(/^www\./, '');
  for (const name of ['_fbp', '_fbc']) {
    document.cookie = `${name}=; expires=${past}; path=/`;
    document.cookie = `${name}=; expires=${past}; path=/; domain=.${rootDomain}`;
  }
}

export function MetaPixelLoader({ pixelId }: MetaPixelLoaderProps) {
  // null until the mount effect reads localStorage — SSR and first client
  // paint never render the script, so no facebook request can precede the
  // consent read.
  const [consent, setConsent] = useState<CookieConsentValue>(null);

  useEffect(() => {
    // localStorage can throw in private mode — a failed read means "no consent".
    let stored: CookieConsentValue = null;
    try {
      stored = getCookieConsent();
    } catch {
      stored = null;
    }
    setConsent(stored);

    // Migration case: visitor declined (now, or under the old un-gated build)
    // but `_fbp` / `_fbc` from that build are still on the domain — clear them.
    if (stored === 'declined') {
      expireMetaCookies();
    }

    function handleConsentChange(event: Event) {
      const { detail } = event as CustomEvent<{ consent: CookieConsentValue }>;
      setConsent(detail.consent);
      if (detail.consent === 'declined') {
        expireMetaCookies();
      }
    }

    window.addEventListener('estrevia:consent', handleConsentChange);
    return () => {
      window.removeEventListener('estrevia:consent', handleConsentChange);
    };
  }, []);

  if (!pixelId || consent !== 'accepted') return null;

  return (
    <Script id="meta-pixel-base" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
    </Script>
  );
}
