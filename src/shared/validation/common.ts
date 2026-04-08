import { z } from 'zod';
import { HouseSystem } from '../types/astrology';

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const timezoneSchema = z.string().regex(
  /^[A-Za-z_]+\/[A-Za-z_\/]+$/,
  'Invalid IANA timezone format',
);

export const houseSystemSchema = z.nativeEnum(HouseSystem);

export const isoDateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Expected ISO date format YYYY-MM-DD',
);

export const timeSchema = z.string().regex(
  /^\d{2}:\d{2}$/,
  'Expected time format HH:mm',
);
