export interface UtmFields {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_click_timestamp?: string;
}

export const UTM_COOKIE_NAME = 'estrevia_utm';

const UTM_KEYS: ReadonlySet<string> = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
]);

export function parseUtmFromSearch(search: string): UtmFields {
  if (!search) return {};
  const params = new URLSearchParams(search);
  const result: UtmFields = {};
  for (const key of UTM_KEYS) {
    const val = params.get(key);
    if (val !== null) {
      (result as Record<string, string>)[key] = val;
    }
  }
  return result;
}

export function readUtmCookie(): UtmFields | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${UTM_COOKIE_NAME}=`));
  if (!entry) return null;
  const raw = entry.slice(UTM_COOKIE_NAME.length + 1);
  try {
    return JSON.parse(decodeURIComponent(raw)) as UtmFields;
  } catch {
    return null;
  }
}

/**
 * Last-touch UTM read: URL search params override cookie keys.
 *
 * Semantics:
 * - If `window.location.search` has any `?utm_*` params, those values win
 *   per-key over cookie (URL is last-touch). The merge is shallow — partial
 *   URL UTM (e.g. only utm_source) leaves untouched-keys from cookie intact.
 * - If URL is clean, cookie is returned verbatim (first-touch preserved).
 * - SSR-safe: returns cookie only when `window` is undefined.
 *
 * Drives drip-email click attribution into Stripe checkout session metadata.
 */
export function readUtmLastTouch(): UtmFields {
  const cookie = readUtmCookie() ?? {};
  if (typeof window === 'undefined') return cookie;
  const urlUtm = parseUtmFromSearch(window.location.search);
  return { ...cookie, ...urlUtm };
}

export function writeUtmCookie(fields: UtmFields, ttlDays = 30): void {
  if (typeof document === 'undefined') return;
  if (Object.keys(fields).length === 0) return;
  const encoded = encodeURIComponent(JSON.stringify(fields));
  const maxAge = ttlDays * 86400;
  document.cookie = `${UTM_COOKIE_NAME}=${encoded}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}
