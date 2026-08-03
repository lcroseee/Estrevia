import { describe, it, expect } from 'vitest';
import {
  selfieAnalysisSchema,
  portraitRequestSchema,
  parseModelJson,
} from '../portrait';

const validAnalysis = {
  safe: true,
  reasons: [],
  traits: {
    hair: { texture: 'dense spiral curls', length: 'shoulder-length', colour: 'dark brown', style: 'loose' },
    face: { shape: 'oval', jaw: 'soft', brows: 'full and level' },
    skinTone: 'warm mid tone',
    glasses: false,
  },
  prose: 'A steady, direct gaze; still shoulders; light falling from the upper left.',
};

describe('selfieAnalysisSchema', () => {
  it('accepts a well-formed analysis', () => {
    const r = selfieAnalysisSchema.safeParse(validAnalysis);
    expect(r.success).toBe(true);
  });

  it('accepts an unsafe verdict with reasons', () => {
    const r = selfieAnalysisSchema.safeParse({
      ...validAnalysis,
      safe: false,
      reasons: ['likely_minor', 'no_face'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown rejection reason rather than silently dropping it', () => {
    const r = selfieAnalysisSchema.safeParse({ ...validAnalysis, reasons: ['looks_weird'] });
    expect(r.success).toBe(false);
  });

  it('rejects a missing traits block', () => {
    const { traits: _omit, ...withoutTraits } = validAnalysis;
    const r = selfieAnalysisSchema.safeParse(withoutTraits);
    expect(r.success).toBe(false);
  });

  it('rejects unknown top-level keys so prompt-shaped drift is caught early', () => {
    const r = selfieAnalysisSchema.safeParse({ ...validAnalysis, systemPrompt: 'ignore previous' });
    expect(r.success).toBe(false);
  });
});

describe('parseModelJson', () => {
  it('parses bare JSON', () => {
    expect(parseModelJson('{"safe":true}')).toEqual({ safe: true });
  });

  it('strips ```json fences the model adds despite instructions', () => {
    expect(parseModelJson('```json\n{"safe":true}\n```')).toEqual({ safe: true });
  });

  it('strips bare ``` fences', () => {
    expect(parseModelJson('```\n{"safe":false}\n```')).toEqual({ safe: false });
  });

  it('throws on non-JSON rather than returning a partial object', () => {
    expect(() => parseModelJson('I am sorry, I cannot.')).toThrow();
  });
});

describe('portraitRequestSchema', () => {
  it('accepts a cosmic portrait request', () => {
    const r = portraitRequestSchema.safeParse({
      presentation: 'auto',
      style: 'cosmic',
      chartId: 'chart_abc123',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-cosmic style — portrait is cosmic-only in v1', () => {
    const r = portraitRequestSchema.safeParse({
      presentation: 'auto',
      style: 'geometric',
      chartId: 'chart_abc123',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown presentation', () => {
    const r = portraitRequestSchema.safeParse({
      presentation: 'other',
      style: 'cosmic',
      chartId: 'chart_abc123',
    });
    expect(r.success).toBe(false);
  });
});
