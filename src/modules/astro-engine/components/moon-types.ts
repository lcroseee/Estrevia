/**
 * Shared types for the Moon Calendar UI.
 * Kept out of the components so every subcomponent imports from one source.
 */

import type { MoonCalendarDay } from '@/shared/types';

export interface DayData {
  day: number;
  angle: number;
  illumination: number;
  emoji: string;
  phaseName: string;
  /** Sidereal Moon sign for this day (null until agent 5 wires server data) */
  moonSign?: string | null;
  /** Sidereal Moon degree within sign (null until agent 5 wires server data) */
  moonDegree?: number | null;
  /** Void-of-course flag (null until wired) */
  isVoidOfCourse?: boolean | null;
}

export interface TodayRef {
  year: number;
  month: number;
  day: number;
}

/**
 * Build DayData from the server-side MoonCalendarDay response.
 * Used once the calendar grid switches off its client approximation.
 */
export function dayDataFromServer(d: MoonCalendarDay, angle: number): DayData {
  return {
    day: parseInt(d.date.split('-')[2] ?? '1', 10),
    angle,
    illumination: d.illumination,
    emoji: d.emoji,
    phaseName: d.phase,
    moonSign: d.moonSign,
    moonDegree: d.moonDegree,
    isVoidOfCourse: d.isVoidOfCourse,
  };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Days in a given month (1-indexed month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Weekday index (0=Sun) of the first of a given month. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}
