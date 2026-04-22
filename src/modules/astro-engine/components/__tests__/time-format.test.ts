import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectFormatFromLocale,
  to24h,
  to12h,
  parsePastedTime,
  type HourFormat,
} from '../time-format';

describe('detectFormatFromLocale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns '12h' for en-US", () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(detectFormatFromLocale()).toBe('12h');
  });

  it("returns '24h' for ru-RU", () => {
    vi.stubGlobal('navigator', { language: 'ru-RU' });
    expect(detectFormatFromLocale()).toBe('24h');
  });

  it("returns '24h' for es-ES", () => {
    vi.stubGlobal('navigator', { language: 'es-ES' });
    expect(detectFormatFromLocale()).toBe('24h');
  });

  it("returns '12h' for en-AU (hourCycle h12)", () => {
    vi.stubGlobal('navigator', { language: 'en-AU' });
    expect(detectFormatFromLocale()).toBe('12h');
  });

  it("returns '24h' fallback when navigator is undefined (SSR)", () => {
    vi.stubGlobal('navigator', undefined);
    expect(detectFormatFromLocale()).toBe('24h');
  });

  it("returns '24h' fallback when locale is malformed", () => {
    vi.stubGlobal('navigator', { language: 'not-a-locale' });
    expect(detectFormatFromLocale()).toBe('24h');
  });
});

describe('to24h', () => {
  it('converts 12:00 AM → 00:00 (midnight)', () => {
    expect(to24h(12, 0, 'AM')).toBe('00:00');
  });

  it('converts 12:00 PM → 12:00 (noon)', () => {
    expect(to24h(12, 0, 'PM')).toBe('12:00');
  });

  it('converts 01:30 AM → 01:30', () => {
    expect(to24h(1, 30, 'AM')).toBe('01:30');
  });

  it('converts 01:30 PM → 13:30', () => {
    expect(to24h(1, 30, 'PM')).toBe('13:30');
  });

  it('converts 11:59 PM → 23:59', () => {
    expect(to24h(11, 59, 'PM')).toBe('23:59');
  });

  it('pads single-digit hours and minutes', () => {
    expect(to24h(3, 5, 'AM')).toBe('03:05');
  });
});

describe('to12h', () => {
  it('converts 00:00 → { hour: 12, minute: 0, meridiem: AM }', () => {
    expect(to12h('00:00')).toEqual({ hour: 12, minute: 0, meridiem: 'AM' });
  });

  it('converts 12:00 → { hour: 12, minute: 0, meridiem: PM }', () => {
    expect(to12h('12:00')).toEqual({ hour: 12, minute: 0, meridiem: 'PM' });
  });

  it('converts 14:30 → { hour: 2, minute: 30, meridiem: PM }', () => {
    expect(to12h('14:30')).toEqual({ hour: 2, minute: 30, meridiem: 'PM' });
  });

  it('converts 01:30 → { hour: 1, minute: 30, meridiem: AM }', () => {
    expect(to12h('01:30')).toEqual({ hour: 1, minute: 30, meridiem: 'AM' });
  });

  it('returns null for empty string', () => {
    expect(to12h('')).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(to12h('not-a-time')).toBeNull();
  });
});

describe('parsePastedTime', () => {
  it('parses "14:30" as 24h', () => {
    expect(parsePastedTime('14:30')).toEqual({
      hh: '14',
      mm: '30',
      meridiem: null,
      detectedFormat: '24h',
    });
  });

  it('parses "2:30 PM" as 12h PM', () => {
    expect(parsePastedTime('2:30 PM')).toEqual({
      hh: '02',
      mm: '30',
      meridiem: 'PM',
      detectedFormat: '12h',
    });
  });

  it('parses "2:30pm" case-insensitive', () => {
    expect(parsePastedTime('2:30pm')).toEqual({
      hh: '02',
      mm: '30',
      meridiem: 'PM',
      detectedFormat: '12h',
    });
  });

  it('parses "12:00 AM" correctly', () => {
    expect(parsePastedTime('12:00 AM')).toEqual({
      hh: '12',
      mm: '00',
      meridiem: 'AM',
      detectedFormat: '12h',
    });
  });

  it('parses "09:15" as 24h', () => {
    expect(parsePastedTime('09:15')).toEqual({
      hh: '09',
      mm: '15',
      meridiem: null,
      detectedFormat: '24h',
    });
  });

  it('returns null for garbage', () => {
    expect(parsePastedTime('abc')).toBeNull();
    expect(parsePastedTime('')).toBeNull();
    expect(parsePastedTime('25:99')).toBeNull();
  });

  it('parses "2:30" without meridiem as ambiguous (caller decides format)', () => {
    expect(parsePastedTime('2:30')).toEqual({
      hh: '02',
      mm: '30',
      meridiem: null,
      detectedFormat: null,
    });
  });
});

const _checkType: HourFormat = '12h';
void _checkType;
