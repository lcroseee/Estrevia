// src/modules/astro-engine/portrait-prompt.ts
import { getBySign } from '@/modules/esoteric/lib/correspondences';
import type { Sign } from '@/shared/types/astrology';
import type { SelfieAnalysis } from '@/shared/validation/portrait';
import { presentationToScale } from './portrait-scale';
import type { ColourScale, Presentation } from './portrait-scale';

export interface PortraitPromptInput {
  sunSign: string;
  moonSign: string;
  ascendantSign: string | null;
  rulingPlanet: string;
  presentation: Presentation;
  analysis: SelfieAnalysis;
}

export interface PortraitPromptResult {
  prompt: string;
  scale: ColourScale;
  palette: { lead: string; accent: string };
  symbols: { tarotTrump: string; animal: string; stone: string; element: string };
}

/**
 * Composes the Portrait prompt from three layers.
 *
 *  1. LOCKED — palette and symbols resolved from content/correspondences/777.json.
 *     The model cannot choose these; the prompt states outright that the palette
 *     is fixed, which is also what neutralises colour words arriving via prose.
 *  2. PROSE — pose, atmosphere and composition, authored by pass 1, which had
 *     the photograph in front of it.
 *  3. LIKENESS — a tuned constant. Not a user control in v1.
 *
 * Pure: no network, no clock, no randomness. Identical input yields an
 * identical prompt, which is what makes the result explainable to the user.
 */
export function buildPortraitPrompt(input: PortraitPromptInput): PortraitPromptResult {
  const scale = presentationToScale(input.presentation, input.sunSign);

  // getBySign expects the `Sign` enum but this input is a plain string
  // (validated upstream against the sidereal engine's sign list); the cast
  // is safe because getBySign does its own string-keyed lookup internally
  // and returns null — never throws — for anything unrecognised.
  const sunCorr = getBySign(input.sunSign as Sign);
  const moonCorr = getBySign(input.moonSign as Sign);

  // Lowercased once here so the palette returned to the caller is the exact
  // substring embedded in the prompt below — the two must match verbatim
  // for the result to be self-explanatory to the user.
  const lead = (sunCorr?.color?.[scale] ?? 'deep indigo').toLowerCase();
  const accent = (moonCorr?.color?.[scale] ?? 'pale gold').toLowerCase();

  const symbols = {
    tarotTrump: sunCorr?.tarotTrump ?? '',
    animal: sunCorr?.animal ?? '',
    stone: sunCorr?.stone ?? '',
    element: sunCorr?.element ?? '',
  };

  const t = input.analysis.traits;

  const likeness =
    'Preserve the subject facial structure, the shape and texture of the hair, ' +
    'and their characteristic features. Heighten rather than replace. ' +
    'The subject must read as the same person and must look alive — never flat, ' +
    'never a generic face.';

  const identity =
    `Hair: ${t.hair.texture}, ${t.hair.length}, ${t.hair.colour}, worn ${t.hair.style}. ` +
    `Face: ${t.face.shape} shape, ${t.face.jaw} jaw, ${t.face.brows} brows. ` +
    `Skin: ${t.skinTone}.` +
    (t.facialHair ? ` Facial hair: ${t.facialHair}.` : '') +
    (t.glasses ? ' Wearing glasses.' : '') +
    (t.distinguishing?.length ? ` Also: ${t.distinguishing.join(', ')}.` : '');

  const ascClause = input.ascendantSign
    ? ` Rising sign ${input.ascendantSign} colours the outward bearing.`
    : '';

  const symbolClause = [symbols.animal, symbols.stone]
    .filter(Boolean)
    .map((s) => s.toLowerCase())
    .join(' and ');

  const prompt =
    'Cosmic portrait of the person in the reference image, ethereal starfield and ' +
    'nebula textures, flowing light. ' +
    likeness +
    ' ' +
    identity +
    ' ' +
    `Astrological signature: ${input.sunSign} Sun ruled by ${input.rulingPlanet}, ` +
    `${input.moonSign} Moon.${ascClause}` +
    (symbols.tarotTrump ? ` Tarot resonance: ${symbols.tarotTrump}.` : '') +
    (symbolClause ? ` Woven motifs of ${symbolClause}.` : '') +
    ' ' +
    `The palette is fixed and must be obeyed: dominant ${lead}, ` +
    `accented by ${accent}. Do not substitute other colours. ` +
    `Element: ${symbols.element}. ` +
    input.analysis.prose +
    ' Dark background (#0A0A0F). No text. Square format.';

  return { prompt, scale, palette: { lead, accent }, symbols };
}
