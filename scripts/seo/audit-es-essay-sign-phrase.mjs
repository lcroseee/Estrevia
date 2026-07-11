#!/usr/bin/env node
/**
 * Ops audit (NOT a vitest test): lists ES planet-in-sign essays whose
 * frontmatter `description` does not yet contain the Spanish search phrase
 * "<planet> en <sign>". The code path (essay keywords) already carries the
 * phrase automatically; this targets the higher-value description surface,
 * which is proprietary content the founder authors.
 *
 * Maps mirror src/shared/lib/astro-i18n.ts (a .mjs cannot import the TS module).
 * Run: node scripts/seo/audit-es-essay-sign-phrase.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

const ES_DIR = join(process.cwd(), 'content', 'essays', 'es');
const PLANET_ES = { sun: 'sol', moon: 'luna', mercury: 'mercurio', venus: 'venus', mars: 'marte', jupiter: 'júpiter', saturn: 'saturno', uranus: 'urano', neptune: 'neptuno', pluto: 'plutón' };
const SIGN_ES = { aries: 'aries', taurus: 'tauro', gemini: 'géminis', cancer: 'cáncer', leo: 'leo', virgo: 'virgo', libra: 'libra', scorpio: 'escorpio', sagittarius: 'sagitario', capricorn: 'capricornio', aquarius: 'acuario', pisces: 'piscis' };

const files = readdirSync(ES_DIR).filter((f) => f.endsWith('.mdx'));
const missing = [];
for (const file of files) {
  const m = file.slice(0, -4).match(/^([a-z]+)-in-([a-z]+)$/);
  if (!m) continue;
  const planet = PLANET_ES[m[1]];
  const sign = SIGN_ES[m[2]];
  if (!planet || !sign) continue;
  const phrase = `${planet} en ${sign}`;
  const { data } = matter(readFileSync(join(ES_DIR, file), 'utf8'));
  const desc = String(data.description ?? '').toLowerCase();
  if (!desc.includes(phrase)) missing.push({ file, phrase });
}
console.log(`ES essays missing the search phrase in description: ${missing.length}/${files.length}`);
for (const { file, phrase } of missing) console.log(`  ${file} → add "${phrase}"`);
