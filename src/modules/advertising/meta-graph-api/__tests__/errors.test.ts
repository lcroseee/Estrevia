// src/modules/advertising/meta-graph-api/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  MetaApiError,
  MetaAuthError,
  MetaPermissionError,
  MetaRateLimitError,
  MetaValidationError,
  MetaServerError,
  classifyMetaError,
} from '../errors';

describe('classifyMetaError', () => {
  it('returns MetaAuthError for code 190', () => {
    const err = classifyMetaError(401, {
      error: { message: 'Token expired', code: 190, fbtrace_id: 'abc' },
    });
    expect(err).toBeInstanceOf(MetaAuthError);
    expect(err.code).toBe(190);
    expect(err.fbtraceId).toBe('abc');
    expect(err.httpStatus).toBe(401);
  });

  it('returns MetaPermissionError for code 200', () => {
    const err = classifyMetaError(403, {
      error: { message: 'No permission', code: 200 },
    });
    expect(err).toBeInstanceOf(MetaPermissionError);
  });

  it('returns MetaRateLimitError for code 17', () => {
    const err = classifyMetaError(400, {
      error: { message: 'Rate limited', code: 17 },
    });
    expect(err).toBeInstanceOf(MetaRateLimitError);
  });

  it('returns MetaValidationError for code 100', () => {
    const err = classifyMetaError(400, {
      error: { message: 'Bad param', code: 100 },
    });
    expect(err).toBeInstanceOf(MetaValidationError);
  });

  it('returns MetaServerError for HTTP 500-599', () => {
    const err = classifyMetaError(503, {
      error: { message: 'Service unavailable', code: 2 },
    });
    expect(err).toBeInstanceOf(MetaServerError);
  });

  it('falls back to MetaApiError for unknown code', () => {
    const err = classifyMetaError(400, {
      error: { message: 'Unknown', code: 99999 },
    });
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).not.toBeInstanceOf(MetaValidationError);
  });
});

describe('MetaApiError', () => {
  it('preserves message, code, fbtraceId, httpStatus', () => {
    const e = new MetaApiError('Boom', { code: 100, fbtraceId: 'x', httpStatus: 400 });
    expect(e.message).toBe('Boom');
    expect(e.code).toBe(100);
    expect(e.fbtraceId).toBe('x');
    expect(e.httpStatus).toBe(400);
  });
});
