export enum Planet {
  Sun = 'Sun',
  Moon = 'Moon',
  Mercury = 'Mercury',
  Venus = 'Venus',
  Mars = 'Mars',
  Jupiter = 'Jupiter',
  Saturn = 'Saturn',
  Uranus = 'Uranus',
  Neptune = 'Neptune',
  Pluto = 'Pluto',
  NorthNode = 'NorthNode',
  Chiron = 'Chiron',
  // Chart angles — not true bodies, used only as PlanetPosition identifiers
  Ascendant = 'Ascendant',
  Midheaven = 'Midheaven',
}

export enum Sign {
  Aries = 'Aries',
  Taurus = 'Taurus',
  Gemini = 'Gemini',
  Cancer = 'Cancer',
  Leo = 'Leo',
  Virgo = 'Virgo',
  Libra = 'Libra',
  Scorpio = 'Scorpio',
  Sagittarius = 'Sagittarius',
  Capricorn = 'Capricorn',
  Aquarius = 'Aquarius',
  Pisces = 'Pisces',
}

export enum Element {
  Fire = 'Fire',
  Earth = 'Earth',
  Air = 'Air',
  Water = 'Water',
}

export enum Modality {
  Cardinal = 'Cardinal',
  Fixed = 'Fixed',
  Mutable = 'Mutable',
}

export enum AspectType {
  Conjunction = 'Conjunction',
  SemiSextile = 'SemiSextile',
  Sextile = 'Sextile',
  Square = 'Square',
  Trine = 'Trine',
  Quincunx = 'Quincunx',
  Opposition = 'Opposition',
}

export const ASPECT_DEGREES = {
  [AspectType.Conjunction]: 0,
  [AspectType.SemiSextile]: 30,
  [AspectType.Sextile]: 60,
  [AspectType.Square]: 90,
  [AspectType.Trine]: 120,
  [AspectType.Quincunx]: 150,
  [AspectType.Opposition]: 180,
} as const;

export enum HouseSystem {
  Placidus = 'Placidus',
  WholeSigns = 'WholeSigns',
  Equal = 'Equal',
}

export interface PlanetPosition {
  planet: Planet;
  absoluteDegree: number;
  tropicalDegree: number;
  sign: Sign;
  signDegree: number;
  minutes: number;
  seconds: number;
  isRetrograde: boolean;
  speed: number;
  house: number | null;
}

export interface HouseCusp {
  house: number;
  degree: number;
  sign: Sign;
  signDegree: number;
}

export interface Aspect {
  planet1: Planet;
  planet2: Planet;
  type: AspectType;
  orb: number;
  isApplying: boolean;
  exactDegree: number;
}

export interface PlanetaryHour {
  planet: Planet;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  isDay: boolean;
}

export interface ChartResult {
  planets: PlanetPosition[];
  houses: HouseCusp[] | null;
  aspects: Aspect[];
  ascendant: PlanetPosition | null;
  midheaven: PlanetPosition | null;
  ayanamsa: number;
  system: 'sidereal' | 'tropical';
  houseSystem: HouseSystem;
  calculatedAt: string;
}
