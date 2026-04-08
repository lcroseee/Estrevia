import { Planet, Sign, Element, Modality, AspectType } from '@/shared/types/astrology';

// Swiss Ephemeris body IDs
export const SWEPH_BODY_IDS = {
  SE_SUN: 0,
  SE_MOON: 1,
  SE_MERCURY: 2,
  SE_VENUS: 3,
  SE_MARS: 4,
  SE_JUPITER: 5,
  SE_SATURN: 6,
  SE_URANUS: 7,
  SE_NEPTUNE: 8,
  SE_PLUTO: 9,
  SE_MEAN_NODE: 10,
  SE_CHIRON: 15,
} as const;

// Aspect definitions: angle in degrees and maximum orb
export const ASPECT_DEFINITIONS: Record<AspectType, { angle: number; orb: number }> = {
  [AspectType.Conjunction]: { angle: 0, orb: 8 },
  [AspectType.Opposition]: { angle: 180, orb: 8 },
  [AspectType.Trine]: { angle: 120, orb: 8 },
  [AspectType.Square]: { angle: 90, orb: 7 },
  [AspectType.Sextile]: { angle: 60, orb: 6 },
  [AspectType.Quincunx]: { angle: 150, orb: 3 },
  [AspectType.SemiSextile]: { angle: 30, orb: 3 },
};

// Zodiac sign names ordered Aries (0) through Pisces (11)
export const SIGN_NAMES: Sign[] = [
  Sign.Aries,
  Sign.Taurus,
  Sign.Gemini,
  Sign.Cancer,
  Sign.Leo,
  Sign.Virgo,
  Sign.Libra,
  Sign.Scorpio,
  Sign.Sagittarius,
  Sign.Capricorn,
  Sign.Aquarius,
  Sign.Pisces,
];

// Chaldean order used for calculating planetary hours
export const CHALDEAN_ORDER: Planet[] = [
  Planet.Saturn,
  Planet.Jupiter,
  Planet.Mars,
  Planet.Sun,
  Planet.Venus,
  Planet.Mercury,
  Planet.Moon,
];

// Maps Planet enum value to Swiss Ephemeris body ID
export const PLANET_TO_SWEPH_ID: Record<Planet, number> = {
  [Planet.Sun]: SWEPH_BODY_IDS.SE_SUN,
  [Planet.Moon]: SWEPH_BODY_IDS.SE_MOON,
  [Planet.Mercury]: SWEPH_BODY_IDS.SE_MERCURY,
  [Planet.Venus]: SWEPH_BODY_IDS.SE_VENUS,
  [Planet.Mars]: SWEPH_BODY_IDS.SE_MARS,
  [Planet.Jupiter]: SWEPH_BODY_IDS.SE_JUPITER,
  [Planet.Saturn]: SWEPH_BODY_IDS.SE_SATURN,
  [Planet.Uranus]: SWEPH_BODY_IDS.SE_URANUS,
  [Planet.Neptune]: SWEPH_BODY_IDS.SE_NEPTUNE,
  [Planet.Pluto]: SWEPH_BODY_IDS.SE_PLUTO,
  [Planet.NorthNode]: SWEPH_BODY_IDS.SE_MEAN_NODE,
  [Planet.Chiron]: SWEPH_BODY_IDS.SE_CHIRON,
};

export const SIGN_ELEMENT: Record<Sign, Element> = {
  [Sign.Aries]: Element.Fire,
  [Sign.Taurus]: Element.Earth,
  [Sign.Gemini]: Element.Air,
  [Sign.Cancer]: Element.Water,
  [Sign.Leo]: Element.Fire,
  [Sign.Virgo]: Element.Earth,
  [Sign.Libra]: Element.Air,
  [Sign.Scorpio]: Element.Water,
  [Sign.Sagittarius]: Element.Fire,
  [Sign.Capricorn]: Element.Earth,
  [Sign.Aquarius]: Element.Air,
  [Sign.Pisces]: Element.Water,
};

export const SIGN_MODALITY: Record<Sign, Modality> = {
  [Sign.Aries]: Modality.Cardinal,
  [Sign.Taurus]: Modality.Fixed,
  [Sign.Gemini]: Modality.Mutable,
  [Sign.Cancer]: Modality.Cardinal,
  [Sign.Leo]: Modality.Fixed,
  [Sign.Virgo]: Modality.Mutable,
  [Sign.Libra]: Modality.Cardinal,
  [Sign.Scorpio]: Modality.Fixed,
  [Sign.Sagittarius]: Modality.Mutable,
  [Sign.Capricorn]: Modality.Cardinal,
  [Sign.Aquarius]: Modality.Fixed,
  [Sign.Pisces]: Modality.Mutable,
};

// Traditional (pre-Uranus) ruling planets
export const SIGN_RULER: Record<Sign, Planet> = {
  [Sign.Aries]: Planet.Mars,
  [Sign.Taurus]: Planet.Venus,
  [Sign.Gemini]: Planet.Mercury,
  [Sign.Cancer]: Planet.Moon,
  [Sign.Leo]: Planet.Sun,
  [Sign.Virgo]: Planet.Mercury,
  [Sign.Libra]: Planet.Venus,
  [Sign.Scorpio]: Planet.Mars,
  [Sign.Sagittarius]: Planet.Jupiter,
  [Sign.Capricorn]: Planet.Saturn,
  [Sign.Aquarius]: Planet.Saturn,
  [Sign.Pisces]: Planet.Jupiter,
};

// Lahiri ayanamsa mode ID for sweph.set_sid_mode()
export const SE_SIDM_LAHIRI = 1;

// Calculation flags
export const SEFLG_SPEED = 256;
export const SEFLG_SIDEREAL = 65536;
export const SEFLG_MOSEPH = 4;

// House system characters for sweph.houses()
export const HOUSE_SYSTEMS = {
  Placidus: 'P',
  WholeSigns: 'W',
  Equal: 'E',
} as const;
