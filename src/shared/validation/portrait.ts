import { z } from 'zod';

/**
 * Why a selfie was refused. Kept as a closed enum so a drifting model response
 * fails validation loudly instead of producing an unlabelled rejection.
 */
export const rejectionReasonSchema = z.enum([
  'no_face',
  'multiple_faces',
  'likely_minor',
  'nsfw',
  'not_a_photo',
  'low_quality',
]);
export type RejectionReason = z.infer<typeof rejectionReasonSchema>;

/**
 * Pass-1 output: safety verdict, appearance traits, and photo-aware prose in
 * one call.
 *
 * Traits describe APPEARANCE ONLY ("dense spiral curls", "warm mid tone") and
 * never ethnic or racial category. This is an ethical line and it also keeps
 * the system away from inferring special-category data.
 *
 * Nothing in this object is ever persisted — see the spec, decision D8.
 */
export const selfieAnalysisSchema = z.strictObject({
  safe: z.boolean(),
  reasons: z.array(rejectionReasonSchema),
  traits: z.strictObject({
    hair: z.strictObject({
      texture: z.string().min(1).max(120),
      length: z.string().min(1).max(120),
      colour: z.string().min(1).max(120),
      style: z.string().min(1).max(120),
    }),
    face: z.strictObject({
      shape: z.string().min(1).max(120),
      jaw: z.string().min(1).max(120),
      brows: z.string().min(1).max(120),
    }),
    skinTone: z.string().min(1).max(120),
    facialHair: z.string().max(120).optional(),
    glasses: z.boolean().optional(),
    distinguishing: z.array(z.string().max(120)).max(6).optional(),
  }),
  prose: z.string().min(1).max(600),
});
export type SelfieAnalysis = z.infer<typeof selfieAnalysisSchema>;

/**
 * Portrait generation request fields (the file itself arrives separately as
 * multipart and is validated by byte inspection, not by zod).
 *
 * `style` is restricted to 'cosmic': the other three AvatarStyle values are
 * non-figurative by construction.
 */
export const portraitRequestSchema = z.strictObject({
  presentation: z.enum(['auto', 'feminine', 'masculine', 'androgynous']),
  style: z.literal('cosmic'),
  chartId: z.string().min(1).max(128),
});
export type PortraitRequest = z.infer<typeof portraitRequestSchema>;

/**
 * Parses a model response that is supposed to be JSON.
 *
 * Gemini intermittently wraps JSON in markdown fences despite an explicit
 * instruction not to; the existing vision checker strips them the same way
 * (src/shared/lib/gemini/vision-client.ts). Throws on anything unparseable so
 * the caller can refund the quota and return a typed error.
 */
export function parseModelJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  return JSON.parse(cleaned);
}
