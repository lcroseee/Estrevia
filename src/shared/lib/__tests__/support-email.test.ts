import { describe, it, expect } from 'vitest';
import { buildSupportEmailBody } from '../email';

describe('buildSupportEmailBody', () => {
  it('prefixes [PRIORITY] for Pro users', () => {
    const { subject } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: true,
      plan: 'pro_annual',
      subject: 'Help me',
      message: 'm',
      userId: 'u1',
    });
    expect(subject).toBe('[PRIORITY] Help me');
  });

  it('prefixes [Support] for free users', () => {
    const { subject } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: false,
      plan: 'free',
      subject: 'Help me',
      message: 'm',
      userId: 'u1',
    });
    expect(subject).toBe('[Support] Help me');
  });

  it('includes plan and userId in body', () => {
    const { text } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: true,
      plan: 'pro_annual',
      subject: 's',
      message: 'hello world',
      userId: 'user_abc',
    });
    expect(text).toContain('Plan: pro_annual');
    expect(text).toContain('User ID: user_abc');
    expect(text).toContain('Pro: YES');
    expect(text).toContain('hello world');
  });

  it('marks anonymous users when userId is null', () => {
    const { text } = buildSupportEmailBody({
      fromEmail: 'a@b.com',
      isPro: false,
      plan: 'free',
      subject: 's',
      message: 'm',
      userId: null,
    });
    expect(text).toContain('User ID: anonymous');
  });
});
