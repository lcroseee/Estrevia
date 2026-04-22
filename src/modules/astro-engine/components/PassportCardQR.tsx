'use client';

/**
 * PassportCardQR — tiny client leaf that lazy-loads the `qrcode` library
 * and renders the 28×28px QR code in the bottom-right corner of a
 * Cosmic Passport card.
 *
 * Split out of PassportCard so the parent can be a Server Component
 * (eliminating ~5 KB of hydration JS on the viral `/s/[id]` route —
 * the `qrcode` library is ~42 KB unminified but only ships the single
 * small function we actually use after tree-shake).
 *
 * SECURITY: The SVG inserted via dangerouslySetInnerHTML is generated
 * by the `qrcode` library from a predictable URL built from our own
 * `siteUrl` + passport ID. No user-controlled content is ever rendered.
 */

import { useEffect, useState } from 'react';

interface PassportCardQRProps {
  passportId: string;
  siteUrl: string;
}

export function PassportCardQR({ passportId, siteUrl }: PassportCardQRProps) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QR) =>
        QR.toString(`${siteUrl}/s/${passportId}`, {
          type: 'svg',
          margin: 1,
          width: 56,
          color: { dark: '#FFFFFF', light: '#00000000' },
        }),
      )
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [passportId, siteUrl]);

  if (!qrSvg) return null;

  return (
    <div
      className="absolute bottom-3 right-3 opacity-40"
      style={{ width: 28, height: 28 }}
      aria-label="QR code link to this passport"
      // eslint-disable-next-line react/no-danger -- qrcode library output, trusted source URL
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  );
}
