// @vitest-environment jsdom
// src/shared/lib/__tests__/image-prep.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeTargetSize,
  isAcceptedImageType,
  MAX_EDGE_PX,
  MAX_UPLOAD_BYTES,
  ACCEPTED_INPUT_TYPES,
} from '../image-prep';

describe('computeTargetSize', () => {
  it('leaves a small image untouched', () => {
    expect(computeTargetSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('caps the long edge at 1024 and preserves aspect ratio, landscape', () => {
    expect(computeTargetSize(4032, 3024)).toEqual({ width: 1024, height: 768 });
  });

  it('caps the long edge at 1024 and preserves aspect ratio, portrait', () => {
    expect(computeTargetSize(3024, 4032)).toEqual({ width: 768, height: 1024 });
  });

  it('handles an exact square', () => {
    expect(computeTargetSize(2000, 2000)).toEqual({ width: 1024, height: 1024 });
  });

  it('never returns a zero dimension for extreme aspect ratios', () => {
    const r = computeTargetSize(10000, 3);
    expect(r.width).toBe(1024);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it('respects an explicit maxEdge override', () => {
    expect(computeTargetSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });
});

describe('isAcceptedImageType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])('accepts %s', (t) => {
    expect(isAcceptedImageType(t)).toBe(true);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', ''])('rejects %s', (t) => {
    expect(isAcceptedImageType(t)).toBe(false);
  });

  it('rejects SVG explicitly — it can carry script', () => {
    expect(ACCEPTED_INPUT_TYPES).not.toContain('image/svg+xml');
  });
});

describe('constants', () => {
  it('caps uploads at 8 MB and the long edge at 1024 px', () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_EDGE_PX).toBe(1024);
  });
});
