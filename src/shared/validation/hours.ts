import { z } from 'zod';
import { coordinatesSchema, timezoneSchema, isoDateSchema } from './common';

export const planetaryHoursQuerySchema = z.object({
  ...coordinatesSchema.shape,
  timezone: timezoneSchema,
  date: isoDateSchema.optional(),
});

export type PlanetaryHoursQuerySchema = z.infer<typeof planetaryHoursQuerySchema>;
