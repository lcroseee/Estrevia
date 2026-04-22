/**
 * Pure helpers for TimePickerField — locale detection, 12h↔24h conversion,
 * and paste-time parsing. No DOM, no React; safe to unit-test in node.
 */

export type HourFormat = '12h' | '24h';
export type Meridiem = 'AM' | 'PM';

export interface PastedTime {
  hh: string;
  mm: string;
  meridiem: Meridiem | null;
  detectedFormat: HourFormat | null; // null when ambiguous (no meridiem, hour <= 12)
}

/** Detect default format from browser locale. Falls back to '24h' off-browser or on any failure. */
export function detectFormatFromLocale(): HourFormat {
  if (typeof navigator === 'undefined' || !navigator.language) return '24h';
  try {
    const lang = navigator.language;
    // Reject obviously malformed tags. BCP-47 language subtag is 2-3 letters,
    // optionally followed by subtags. Intl.DateTimeFormat silently falls back
    // for unknown-but-well-formed tags, so explicitly verify support.
    const supported = Intl.DateTimeFormat.supportedLocalesOf(lang);
    if (supported.length === 0) return '24h';
    const cycle = new Intl.DateTimeFormat(lang, { hour: 'numeric' })
      .resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12' ? '12h' : '24h';
  } catch {
    return '24h';
  }
}

/**
 * Convert 12-hour clock values to the canonical "HH:mm" 24-hour string.
 *   12:xx AM -> 00:xx (midnight)
 *   12:xx PM -> 12:xx (noon)
 *   1:xx-11:xx PM -> 13:xx-23:xx
 */
export function to24h(hour12: number, minute: number, meridiem: Meridiem): string {
  let h24 = hour12 % 12;
  if (meridiem === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Convert a canonical "HH:mm" 24-hour string to 12-hour parts.
 * Returns null when the input is empty or not in the expected shape.
 */
export function to12h(value: string): { hour: number; minute: number; meridiem: Meridiem } | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h24 = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h24 < 0 || h24 > 23 || m < 0 || m > 59) return null;
  const meridiem: Meridiem = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour: hour12, minute: m, meridiem };
}

/**
 * Parse a pasted time string. Supports:
 *   "14:30"        -> 24h
 *   "2:30 PM"      -> 12h PM
 *   "2:30pm"       -> 12h PM (case-insensitive, whitespace optional)
 *   "2:30"         -> ambiguous (detectedFormat = null)
 *
 * Returns null when the string is empty, malformed, or out of range.
 */
export function parsePastedTime(input: string): PastedTime | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiemRaw = match[3]?.toUpperCase() as Meridiem | undefined;

  if (m < 0 || m > 59) return null;

  if (meridiemRaw) {
    if (h < 1 || h > 12) return null;
    return {
      hh: String(h).padStart(2, '0'),
      mm: String(m).padStart(2, '0'),
      meridiem: meridiemRaw,
      detectedFormat: '12h',
    };
  }

  if (h < 0 || h > 23) return null;
  // Two-digit padded hour ("09:15", "00:30") or hour > 12 signals 24h.
  // Unpadded single-digit hour ≤ 12 ("2:30") is ambiguous — caller decides.
  const isTwoDigitHour = match[1].length === 2;
  const unambiguous24h = h > 12 || isTwoDigitHour;
  return {
    hh: String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
    meridiem: null,
    detectedFormat: unambiguous24h ? '24h' : null,
  };
}
