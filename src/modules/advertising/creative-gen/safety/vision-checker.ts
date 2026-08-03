/**
 * Moved to `@/shared/lib/gemini/vision-client` so that non-advertising
 * modules can consume it without a cross-module dependency
 * (CLAUDE.md: "No cross-module deps; depend only on shared/").
 * This file remains as a re-export so advertising call sites are unchanged.
 */
export * from '@/shared/lib/gemini/vision-client';
