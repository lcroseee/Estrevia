// src/modules/advertising/meta-graph-api/errors.ts
import type { MetaErrorEnvelope } from './types';

interface MetaApiErrorOpts {
  code: number;
  subcode?: number;
  fbtraceId?: string;
  httpStatus: number;
}

export class MetaApiError extends Error {
  readonly code: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;
  readonly httpStatus: number;

  constructor(message: string, opts: MetaApiErrorOpts) {
    super(message);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.subcode = opts.subcode;
    this.fbtraceId = opts.fbtraceId;
    this.httpStatus = opts.httpStatus;
  }
}

export class MetaAuthError extends MetaApiError {}
export class MetaPermissionError extends MetaApiError {}
export class MetaRateLimitError extends MetaApiError {}
export class MetaValidationError extends MetaApiError {}
export class MetaServerError extends MetaApiError {}
export class MetaNetworkError extends MetaApiError {}

const AUTH_CODES = new Set([190, 102, 463]);
const PERMISSION_CODES = new Set([200, 803, 10]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 80004]);
const VALIDATION_CODES = new Set([100, 1487, 1815108, 1487749, 1487472]);

export function classifyMetaError(httpStatus: number, body: MetaErrorEnvelope): MetaApiError {
  const { code, message, fbtrace_id, error_subcode } = body.error;
  const opts: MetaApiErrorOpts = {
    code,
    subcode: error_subcode,
    fbtraceId: fbtrace_id,
    httpStatus,
  };

  if (AUTH_CODES.has(code)) return new MetaAuthError(message, opts);
  if (PERMISSION_CODES.has(code)) return new MetaPermissionError(message, opts);
  if (RATE_LIMIT_CODES.has(code)) return new MetaRateLimitError(message, opts);
  if (VALIDATION_CODES.has(code)) return new MetaValidationError(message, opts);
  if (httpStatus >= 500) return new MetaServerError(message, opts);
  return new MetaApiError(message, opts);
}
