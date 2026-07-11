import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Drizzle journal integrity (SP-F D4).
 *
 * The migrator applies entries where folderMillis (`when`) exceeds the
 * last-applied created_at — non-monotonic `when` values make it silently
 * skip migrations (this actually happened: idx 14-17 shipped with 2025
 * epochs below idx 12). This test makes any future drift a CI failure.
 *
 * Note: prod migrations stay hand-applied (idempotent SQL via Pool+ws);
 * this test guards the journal's internal consistency only.
 */

const DRIZZLE_DIR = path.resolve(__dirname, '..');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

const journal = JSON.parse(
  readFileSync(path.join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'),
) as { entries: JournalEntry[] };

describe('drizzle journal integrity', () => {
  it('idx values are contiguous from 0', () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
    });
  });

  it('when timestamps are strictly increasing (migrator ordering)', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(
        journal.entries[i].when,
        `entry idx ${journal.entries[i].idx} (${journal.entries[i].tag}) must be after ${journal.entries[i - 1].tag}`,
      ).toBeGreaterThan(journal.entries[i - 1].when);
    }
  });

  it('every journal tag has a matching .sql migration file', () => {
    for (const entry of journal.entries) {
      expect(
        existsSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`)),
        `missing drizzle/${entry.tag}.sql`,
      ).toBe(true);
    }
  });

  it('every on-disk migration .sql is registered in the journal', () => {
    const onDisk = readdirSync(DRIZZLE_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace(/\.sql$/, ''))
      .sort();
    const registered = journal.entries.map((e) => e.tag).sort();
    expect(registered).toEqual(onDisk);
  });
});
