/**
 * Ordered FAQ key list for the synastry page (namespace `synastry` in the
 * message files). Single source of truth so the visible <details> FAQ and the
 * FAQPage JSON-LD stay in lockstep — Google requires a FAQ's structured answer
 * to be visible on the page.
 *
 * `whatIs` leads deliberately: the query "que es sinastria" already ranks
 * pos 10.5 (SEO audit 2026-07-06 finding #16) but had no matching FAQ entry —
 * this puts that exact question into the FAQPage structured data for AEO / LLM
 * answer-extraction.
 */
export const SYNASTRY_FAQ_KEYS = [
  { qKey: 'whatIsQ', aKey: 'whatIsA' },
  { qKey: 'faq1Q', aKey: 'faq1A' },
  { qKey: 'faq2Q', aKey: 'faq2A' },
  { qKey: 'faq3Q', aKey: 'faq3A' },
  { qKey: 'faq4Q', aKey: 'faq4A' },
  { qKey: 'faq5Q', aKey: 'faq5A' },
] as const;
