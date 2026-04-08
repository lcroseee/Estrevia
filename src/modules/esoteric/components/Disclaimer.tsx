/**
 * Disclaimer component — required on every essay page per content legal rules.
 * Astrology content must not be presented as medical/financial advice.
 */

export function Disclaimer() {
  return (
    <aside
      className="mt-12 border border-white/10 rounded-lg px-5 py-4 bg-white/3"
      role="note"
      aria-label="Content disclaimer"
    >
      <p className="text-xs text-white/40 leading-relaxed font-[var(--font-geist-sans)]">
        Astrology is a symbolic system for self-reflection and cultural inquiry. Nothing on this
        page constitutes medical, psychological, financial, or legal advice. Interpretations describe
        archetypal tendencies — not guaranteed outcomes or fixed destiny. Consult qualified
        professionals for decisions affecting your health, finances, or legal standing.
      </p>
    </aside>
  );
}
