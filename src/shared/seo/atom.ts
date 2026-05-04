/**
 * Atom 1.0 feed builder for Estrevia.
 *
 * Atom is preferred over RSS 2.0:
 *   - W3C standard (RFC 4287); strict and validated
 *   - Better date handling (xsd:dateTime ISO 8601)
 *   - Required <id> per entry — unambiguous deduplication
 *   - `<summary>` vs `<content>` separation (we only emit summary)
 *
 * All XML output goes through escapeXml() — never string-concat raw content.
 */

const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => XML_ESCAPE_MAP[ch] ?? ch);
}

export interface AtomEntry {
  title: string;
  summary: string;
  link: string;
  /** ISO date string (YYYY-MM-DD) or full ISO 8601. */
  published: string;
  /** ISO date string (YYYY-MM-DD) or full ISO 8601. */
  updated: string;
}

export interface AtomFeedOptions {
  feedUrl: string;
  siteUrl: string;
  title: string;
  subtitle: string;
  locale: 'en' | 'es';
  updated: Date;
  entries: AtomEntry[];
  /** Defaults to "Estrevia" — Organization-level author per spec decision #1. */
  authorName?: string;
}

function toIsoString(input: string): string {
  // Accept "YYYY-MM-DD" → midnight UTC, or pre-formed ISO 8601
  const date = input.length === 10 ? new Date(`${input}T00:00:00Z`) : new Date(input);
  return date.toISOString();
}

export function buildAtomFeed(options: AtomFeedOptions): string {
  const {
    feedUrl,
    siteUrl,
    title,
    subtitle,
    locale,
    updated,
    entries,
    authorName = 'Estrevia',
  } = options;

  const entryXml = entries
    .map(
      (e) => `  <entry>
    <id>${escapeXml(e.link)}</id>
    <title>${escapeXml(e.title)}</title>
    <link rel="alternate" href="${escapeXml(e.link)}"/>
    <summary>${escapeXml(e.summary)}</summary>
    <published>${toIsoString(e.published)}</published>
    <updated>${toIsoString(e.updated)}</updated>
  </entry>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${locale}">
  <id>${escapeXml(feedUrl)}</id>
  <title>${escapeXml(title)}</title>
  <subtitle>${escapeXml(subtitle)}</subtitle>
  <link rel="self" href="${escapeXml(feedUrl)}"/>
  <link rel="alternate" href="${escapeXml(siteUrl)}"/>
  <updated>${updated.toISOString()}</updated>
  <author><name>${escapeXml(authorName)}</name></author>
${entryXml}
</feed>`;
}
