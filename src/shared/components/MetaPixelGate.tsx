'use client';

/**
 * MetaPixelGate — consent-gated Meta Pixel base loader.
 *
 * Loads connect.facebook.net/en_US/fbevents.js (~248 KiB) ONLY after the user
 * has accepted analytics cookies, mirroring PostHogProvider. Previously the
 * Pixel loaded sitewide with no consent check (perf + consent-hygiene bug).
 * Every fbq() call site already guards `typeof fbq === 'function'`, so events
 * fired before consent simply no-op.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getCookieConsent } from '@/shared/components/PostHogProvider';
import type { CookieConsentValue } from '@/shared/components/PostHogProvider';
import { hasAnalyticsConsent } from '@/shared/lib/consent';

export function MetaPixelGate({ pixelId }: { pixelId: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (hasAnalyticsConsent(getCookieConsent())) {
      setEnabled(true);
      return;
    }
    function onConsent(event: Event) {
      const { detail } = event as CustomEvent<{ consent: CookieConsentValue }>;
      if (detail?.consent === 'accepted') setEnabled(true);
    }
    window.addEventListener('estrevia:consent', onConsent);
    return () => window.removeEventListener('estrevia:consent', onConsent);
  }, []);

  if (!enabled) return null;

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
