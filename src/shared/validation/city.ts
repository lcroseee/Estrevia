import { z } from 'zod';

export const cityQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.number().int().min(1).max(20).default(5),
});

export type CityQuerySchema = z.infer<typeof cityQuerySchema>;
