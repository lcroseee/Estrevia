import { TITLE_SUFFIX, MAX_TITLE_LENGTH } from './constants';

/**
 * Builds the tarot card page <title> (pre-suffix — createMetadata appends
 * TITLE_SUFFIX and truncates to MAX_TITLE_LENGTH).
 *
 * EN, and the ES control (experiment off): "<Name> — Thoth Tarot".
 *
 * ES retitle experiment (T17): "<Name>: significado en el tarot (Thoth)" —
 * targets the "<carta> significado tarot" ES query cluster (tarot-ES cluster is
 * wavg pos 74 / 0 clicks at baseline, spec §2). The " (Thoth)" deck signal is
 * dropped when the composed title would exceed the 60-char budget, so no ES
 * card ever truncates mid-word (13/78 ES names would otherwise overflow — e.g.
 * "Caballero de Espadas"). Both variants stay ≤ 49 chars pre-suffix.
 */
export function buildTarotCardTitle(
  localizedName: string,
  locale: 'en' | 'es',
  retitleEnabled: boolean,
): string {
  if (locale !== 'es' || !retitleEnabled) {
    return `${localizedName} — Thoth Tarot`;
  }
  const budget = MAX_TITLE_LENGTH - TITLE_SUFFIX.length; // 60 - 11 = 49
  const withDeck = `${localizedName}: significado en el tarot (Thoth)`;
  if (withDeck.length <= budget) return withDeck;
  return `${localizedName}: significado en el tarot`;
}

/**
 * Env kill-switch for the 4-week ES-retitle measurement (T17). Default ON so
 * the experiment runs on the deploy that ships this code; set
 * TAROT_ES_RETITLE_EXPERIMENT=off in Vercel prod AND redeploy to "cap"/revert
 * after the window. This is a BUILD-TIME flag: the 78 tarot pages are
 * statically pre-rendered (generateStaticParams + revalidate=86400), so the
 * title is baked at build — changing the env var in Vercel requires a rebuild
 * for the flip to take effect. No source-code change is needed to flip it.
 */
export function isTarotEsRetitleEnabled(): boolean {
  return process.env.TAROT_ES_RETITLE_EXPERIMENT !== 'off';
}
