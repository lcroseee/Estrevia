/**
 * Advertising agent types use snake_case for field names because the primary
 * data shapes mirror Meta Marketing API responses (which are snake_case
 * natively). Internal agent types (BrandVoiceScore, FeatureGate, etc.) follow
 * the same convention for intra-module consistency. This differs from the
 * camelCase convention in @/shared/types/api and @/shared/types/astrology.
 */

export * from './perceive';
export * from './decide';
export * from './creative';
export * from './audience';
export * from './audit';
