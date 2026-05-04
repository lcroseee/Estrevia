import { describe, it, expect } from 'vitest';
import type { CapiEventPayload, CapiUserData } from '../types';

describe('meta-capi types', () => {
  it('CapiEventPayload accepts required fields', () => {
    const p: CapiEventPayload = {
      event_name: 'Lead',
      event_time: 1714867200,
      event_id: 'abc123',
      action_source: 'website',
      user_data: { em: 'hashed_email' },
    };
    expect(p.event_name).toBe('Lead');
  });

  it('CapiUserData allows partial fields', () => {
    const u: CapiUserData = { external_id: 'hashed_uid' };
    expect(u.external_id).toBeDefined();
    expect(u.em).toBeUndefined();
  });
});
