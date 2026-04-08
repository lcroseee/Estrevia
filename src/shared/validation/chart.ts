import { z } from 'zod';
import { HouseSystem } from '../types/astrology';
import {
  coordinatesSchema,
  timezoneSchema,
  isoDateSchema,
  timeSchema,
  houseSystemSchema,
} from './common';

export const chartCalculateSchema = z.object({
  date: isoDateSchema,
  time: timeSchema.nullable(),
  ...coordinatesSchema.shape,
  timezone: timezoneSchema,
  houseSystem: houseSystemSchema.default(HouseSystem.Placidus),
});

export type ChartCalculateSchema = z.infer<typeof chartCalculateSchema>;

export const chartSaveSchema = z.object({
  chartId: z.string().min(1),
  name: z.string().max(100).optional(),
  date: isoDateSchema,
  time: timeSchema.nullable(),
  ...coordinatesSchema.shape,
  timezone: timezoneSchema,
});

export type ChartSaveSchema = z.infer<typeof chartSaveSchema>;
