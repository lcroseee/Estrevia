/**
 * Extracts FAQ Q&A pairs from an essay markdown body.
 *
 * Heading is bilingual ("## FAQ" | "## Preguntas Frecuentes"). Answers stop at
 * the next question, the next H2, a horizontal rule (---), or a blockquote (>)
 * so the trailing disclaimer never bleeds into the last answer.
 */
export function extractFaqItems(
  markdown: string,
): Array<{ question: string; answer: string }> {
  const faqStart = markdown.search(/^##\s+(FAQ|Preguntas Frecuentes)/im);
  if (faqStart === -1) return [];

  const faqSection = markdown.slice(faqStart);

  const items: Array<{ question: string; answer: string }> = [];
  const questionRegex = /\*\*([^*]+\?)\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*]+\?\*\*|\n##\s|\n---|\n>|$)/g;

  let match: RegExpExecArray | null;
  while ((match = questionRegex.exec(faqSection)) !== null) {
    const question = match[1]?.trim();
    const answer = match[2]?.trim().replace(/\n+/g, ' ');
    if (question && answer) {
      items.push({ question, answer });
    }
  }

  return items.slice(0, 8);
}
