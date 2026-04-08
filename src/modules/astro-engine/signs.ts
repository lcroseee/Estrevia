import { Sign } from '@/shared/types/astrology';
import { SIGN_NAMES } from './constants';

export interface SignPosition {
  sign: Sign;
  signDegree: number;  // integer 0-29
  minutes: number;     // integer 0-59
  seconds: number;     // integer 0-59
}

/**
 * Convert an absolute ecliptic degree [0, 360) to zodiac sign position.
 * 0-30° = Aries, 30-60° = Taurus, ..., 330-360° = Pisces.
 */
export function absoluteToSignPosition(absoluteDegree: number): SignPosition {
  // Normalize to [0, 360)
  const normalized = ((absoluteDegree % 360) + 360) % 360;

  const signIndex = Math.floor(normalized / 30);
  const sign = SIGN_NAMES[signIndex]!;

  // Degree within sign (0-29.999...)
  const degreeWithinSign = normalized - signIndex * 30;
  const signDegree = Math.floor(degreeWithinSign);

  // Extract minutes from fractional degree
  const minutesFloat = (degreeWithinSign - signDegree) * 60;
  const minutes = Math.floor(minutesFloat);

  // Extract seconds from fractional minutes
  const seconds = Math.floor((minutesFloat - minutes) * 60);

  return { sign, signDegree, minutes, seconds };
}
