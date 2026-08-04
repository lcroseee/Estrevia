import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { avatars, type Avatar } from '../schema';

describe('avatars table', () => {
  const config = getTableConfig(avatars);
  const columns = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('is named avatars', () => {
    expect(config.name).toBe('avatars');
  });

  it('has every column the portrait flow needs', () => {
    expect(Object.keys(columns).sort()).toEqual(
      [
        'blob_pathname',
        'created_at',
        'id',
        'is_shared',
        'mode',
        'palette',
        'presentation',
        'scale',
        'style',
        'user_id',
      ].sort(),
    );
  });

  it('stores NO face-derived data — spec decision D8', () => {
    const names = Object.keys(columns).join(',');
    expect(names).not.toMatch(/trait|selfie|face|hair|skin|photo/i);
  });

  it('requires user_id, mode, style and blob_pathname', () => {
    expect(columns['user_id'].notNull).toBe(true);
    expect(columns['mode'].notNull).toBe(true);
    expect(columns['style'].notNull).toBe(true);
    expect(columns['blob_pathname'].notNull).toBe(true);
  });

  it('defaults is_shared to false so nothing is public by accident', () => {
    expect(columns['is_shared'].notNull).toBe(true);
    expect(columns['is_shared'].hasDefault).toBe(true);
  });

  it('allows a null presentation so abstract rows fit the same table', () => {
    expect(columns['presentation'].notNull).toBe(false);
  });

  it('exports an Avatar row type ($inferSelect) for downstream readers', () => {
    // Type-level check (enforced by `npm run typecheck`, not by vitest's
    // esbuild transpile): if `Avatar` isn't exported from schema.ts this
    // line fails to compile. Tasks 9-11 import it to read avatar rows.
    const row: Avatar = {
      id: 'avatar_1',
      userId: 'user_1',
      mode: 'portrait',
      style: 'cosmic',
      presentation: null,
      scale: null,
      blobPathname: 'avatars/user_1/avatar_1.png',
      palette: { lead: '#000000', accent: '#ffffff' },
      isShared: false,
      createdAt: new Date(),
    };
    expect(row.blobPathname).toBe('avatars/user_1/avatar_1.png');
  });
});
