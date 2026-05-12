import type { HookTemplate } from '@/shared/types/advertising';
import { hooksEn, getHookTemplate as getHookTemplateEn } from './hooks-en';
import { hooksEs, getHookTemplateEs } from './hooks-es';

export { hooksEn } from './hooks-en';
export { hooksEs } from './hooks-es';

// All hooks across all locales
export const allHooks: HookTemplate[] = [...hooksEn, ...hooksEs];

/**
 * Look up a hook template by ID across all locales.
 * ID prefix determines locale: `en-*` for English, `es-*` for Spanish.
 */
export function getHookTemplate(id: string): HookTemplate | undefined {
  if (id.startsWith('en-')) return getHookTemplateEn(id);
  if (id.startsWith('es-')) return getHookTemplateEs(id);
  return undefined;
}

/**
 * Get all hook templates for a given locale.
 */
export function getHooksByLocale(locale: 'en' | 'es'): HookTemplate[] {
  return locale === 'en' ? hooksEn : hooksEs;
}

/**
 * Get all hook templates for a given archetype, optionally filtered by locale.
 */
export function getHooksByArchetype(
  archetype: HookTemplate['archetype'],
  locale?: 'en' | 'es',
): HookTemplate[] {
  const source = locale ? getHooksByLocale(locale) : allHooks;
  return source.filter(h => h.archetype === archetype);
}

/**
 * Returns hook templates for a locale, filtering out archetypes that are
 * env-gated until prerequisites are met.
 *
 * Currently the only env-gated archetype is `peer_discovery`, which requires
 * verifiable social-proof backing (≥2000 PostHog `chart_calculated` events).
 * Founder flips `PEER_DISCOVERY_ENABLED=true` in Vercel env after manual
 * confirmation.
 *
 * Fail-safe: any value other than the literal string 'true' keeps the gate
 * closed.
 *
 * @param locale Target locale.
 * @param env    Environment record; defaults to `process.env`. Injectable for tests.
 */
export function getEligibleHooks(
  locale: 'en' | 'es',
  env: { PEER_DISCOVERY_ENABLED?: string } = process.env as {
    PEER_DISCOVERY_ENABLED?: string;
  },
): HookTemplate[] {
  const all = getHooksByLocale(locale);
  const peerDiscoveryEnabled = env.PEER_DISCOVERY_ENABLED === 'true';
  return peerDiscoveryEnabled
    ? all
    : all.filter(h => h.archetype !== 'peer_discovery');
}
