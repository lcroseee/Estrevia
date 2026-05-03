/**
 * Avatar prompt builder — the proprietary core of Estrevia's avatar feature.
 *
 * Weaves 777 correspondences (Crowley / Golden Dawn / Liber 777) into a
 * Gemini Imagen prompt. Each Sun sign maps to a Tarot trump, a king-scale
 * color, an animal, and a stone (via the Hebrew letter path); each ruling
 * planet maps to a Sephira with its own correspondences. This is what
 * differentiates Estrevia avatars from a generic "cosmic art" generator —
 * the prompt is composed from data in `content/correspondences/777.json`,
 * which is proprietary and not derivable from public astrology APIs.
 *
 * Fallback behavior: if a Sign or Planet lookup fails (only possible for
 * unknown values, since all 12 signs and 7 traditional rulers have entries),
 * the function degrades to the simpler Sun/Moon/element prompt.
 */

import { Sign as SignEnum } from '@/shared/types/astrology';
import { SIGN_RULER } from './constants';
import { getBySign, getByPlanet } from '@/modules/esoteric/lib/correspondences';

export type AvatarStyle = 'cosmic' | 'tarot' | 'geometric' | 'nebula';

export interface BuildAvatarPromptInput {
  sunSign: string;
  moonSign: string;
  ascendantSign?: string;
  element: string;
  style: AvatarStyle;
}

const ELEMENT_PALETTES: Record<string, string> = {
  Fire: 'warm reds, oranges, and golds',
  Earth: 'deep greens, browns, and amber',
  Air: 'light blues, silvers, and whites',
  Water: 'deep blues, purples, and teals',
};

const STYLE_PROMPTS: Record<AvatarStyle, string> = {
  cosmic:
    'Cosmic energy portrait, ethereal starfield, nebula textures, flowing light',
  tarot:
    'Mystical tarot card art style, ornate borders, symbolic imagery, illuminated manuscript feel',
  geometric:
    'Sacred geometry patterns, precise mathematical forms, golden ratio spirals, crystalline structures',
  nebula:
    'Deep space nebula, swirling cosmic gases, stellar birth, vast cosmic scale',
};

const KNOWN_SIGNS = new Set(Object.values(SignEnum));

export function buildAvatarPrompt(input: BuildAvatarPromptInput): string {
  const { sunSign, moonSign, ascendantSign, element, style } = input;

  const stylePrompt = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.cosmic;
  const elementPalette = ELEMENT_PALETTES[element] ?? 'cosmic blues and purples';

  const ascDesc = ascendantSign
    ? `, outer aura inspired by ${ascendantSign}`
    : '';

  // Look up 777 correspondences. Unknown signs return null and we fall
  // through to the simpler prompt below.
  const sunCorr = KNOWN_SIGNS.has(sunSign as SignEnum)
    ? getBySign(sunSign as SignEnum)
    : null;

  const rulingPlanet = KNOWN_SIGNS.has(sunSign as SignEnum)
    ? SIGN_RULER[sunSign as SignEnum]
    : null;
  const planetCorr = rulingPlanet ? getByPlanet(rulingPlanet) : null;

  if (!sunCorr || !rulingPlanet) {
    // Defensive fallback — no 777 enrichment.
    return `${stylePrompt}. Abstract cosmic avatar representing ${sunSign} solar energy with ${moonSign} lunar essence${ascDesc}. Color palette: ${elementPalette}. Dark background (#0A0A0F). No text, no face, no human features. Square format, mystical and ethereal.`;
  }

  // 777-enriched prompt. King-scale color is the path's dominant chromatic
  // attribution — more specific than the element palette, so it overrides.
  const tarotTrump = sunCorr.tarotTrump;
  const dominantColor = sunCorr.color.king.toLowerCase();
  const animal = sunCorr.animal.toLowerCase();
  const stone = (planetCorr?.stone ?? sunCorr.stone).toLowerCase();

  // Symbolic motifs are concrete visual elements Imagen can render.
  // We deliberately omit hebrewLetter (Imagen renders text poorly) and
  // perfume (no visual mapping).
  const symbolClause = ` Symbolic motifs: ${stone} luminosity, ${animal} silhouettes woven subtly into the composition.`;

  return `${stylePrompt}. Abstract cosmic avatar embodying ${tarotTrump} (Tarot of ${sunSign}), solar essence ruled by ${rulingPlanet}, with ${moonSign} lunar essence${ascDesc}. Dominant ${dominantColor} hue, accented by ${elementPalette}.${symbolClause} Dark background (#0A0A0F). No text, no face, no human features. Square format, mystical and ethereal.`;
}
