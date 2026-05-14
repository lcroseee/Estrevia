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

  it('CapiUserData accepts fbc + fbp as optional plaintext fields', () => {
    const u: CapiUserData = {
      em: 'hashed',
      external_id: 'hashed_uid',
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
    };
    expect(u.fbc).toBe('fb.1.1714867200.AbCdEf123');
    expect(u.fbp).toBe('fb.1.1714867200.987654321');
  });
});
