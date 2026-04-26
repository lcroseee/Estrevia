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
