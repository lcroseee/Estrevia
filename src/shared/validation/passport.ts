import { z } from 'zod';
import { Sign, Element, Planet } from '../types/astrology';

export const createPassportSchema = z.object({
  sunSign: z.nativeEnum(Sign),
  moonSign: z.nativeEnum(Sign),
  ascendantSign: z.nativeEnum(Sign).nullable(),
  element: z.nativeEnum(Element),
  rulingPlanet: z.nativeEnum(Planet),
  rarityPercent: z.number().min(0).max(100),
});

export type CreatePassportSchema = z.infer<typeof createPassportSchema>;
