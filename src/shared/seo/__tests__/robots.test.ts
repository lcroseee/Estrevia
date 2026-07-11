import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';
import { SITE_URL } from '../constants';

describe('robots.txt', () => {
  it('exposes exactly one User-Agent group (merged)', () => {
    const { rules } = robots();
    const groups = Array.isArray(rules) ? rules : [rules];
    expect(groups).toHaveLength(1);
    expect(groups[0].userAgent).toBe('*');
  });

  it('keeps every allow/disallow after the merge (nothing dropped)', () => {
    const { rules } = robots();
    const group = Array.isArray(rules) ? rules[0] : rules;
    const allow = ([] as string[]).concat(group.allow ?? []);
    const disallow = ([] as string[]).concat(group.disallow ?? []);
    expect(allow).toEqual(
      expect.arrayContaining(['/', '/api/og/', '/api/v1/docs', '/api/v1/sidereal/']),
    );
    expect(disallow).toEqual(expect.arrayContaining(['/api/', '/s/']));
  });

  it('still advertises the sitemap', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
