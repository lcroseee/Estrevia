import { describe, it, expect } from 'vitest';
import { extractFaqItems } from '../faq';

describe('extractFaqItems', () => {
  it('extracts English FAQ pairs under "## FAQ"', () => {
    const md = `## FAQ\n\n**What is sidereal astrology?**\nIt tracks the real constellations.\n`;
    const items = extractFaqItems(md);
    expect(items).toHaveLength(1);
    expect(items[0].question).toBe('What is sidereal astrology?');
    expect(items[0].answer).toBe('It tracks the real constellations.');
  });

  it('extracts Spanish FAQ pairs under "## Preguntas Frecuentes"', () => {
    const md = `## Preguntas Frecuentes\n\n**¿Qué es la astrología sideral?**\nSigue las constelaciones reales.\n`;
    const items = extractFaqItems(md);
    expect(items).toHaveLength(1);
    expect(items[0].question).toBe('¿Qué es la astrología sideral?');
    expect(items[0].answer).toBe('Sigue las constelaciones reales.');
  });

  it('stops the answer at a horizontal rule (no disclaimer bleed)', () => {
    const md = `## FAQ\n\n**Is this advice?**\nNo, it is for reflection.\n\n---\n\n*Not medical or financial advice.*\n`;
    const items = extractFaqItems(md);
    expect(items).toHaveLength(1);
    expect(items[0].answer).toBe('No, it is for reflection.');
    expect(items[0].answer).not.toContain('advice.');
  });
});
