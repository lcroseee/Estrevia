/**
 * Read Meta Pixel attribution cookies (_fbc, _fbp) from document.cookie.
 *
 * Pixel JS sets these automatically:
 *  - `_fbc` (fb.1.<ts>.<fbclid>) — present only when the visitor landed via a
 *    URL with ?fbclid=… (i.e. came from a Meta ad). Used by CAPI to bind
 *    server-side conversions to the original ad-click.
 *  - `_fbp` (fb.1.<ts>.<random>) — set on every Pixel-initialised visit;
 *    used for cross-page and cross-domain dedupe.
 *
 * Both values are passed verbatim to Meta's CAPI (no hashing). Missing values
 * are omitted from the result rather than returned as empty strings.
 *
 * SSR safe: returns {} when `document` is undefined.
 */
export function readMetaCookies(): { fbc?: string; fbp?: string } {
  if (typeof document === 'undefined') return {};
  const out: { fbc?: string; fbp?: string } = {};
  for (const c of document.cookie.split(';')) {
    const i = c.indexOf('=');
    if (i < 0) continue;
    const k = c.slice(0, i).trim();
    const v = c.slice(i + 1).trim();
    if (k === '_fbc') out.fbc = v;
    else if (k === '_fbp') out.fbp = v;
  }
  return out;
}
