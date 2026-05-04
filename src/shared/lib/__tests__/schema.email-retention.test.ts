import { describe, it, expect } from 'vitest';
import { users, sentEmails } from '../schema';

describe('users — retention columns', () => {
  it('declares locale enum en|es', () => {
    const col = users.locale;
    expect(col.enumValues).toEqual(['en', 'es']);
    expect(col.notNull).toBe(true);
    expect(col.default).toBe('en');
  });
  it('declares last_seen_at as nullable timestamptz', () => {
    expect(users.lastSeenAt.notNull).toBe(false);
  });
  it('declares marketing_email_opt_in default true', () => {
    expect(users.marketingEmailOptIn.default).toBe(true);
  });
});

describe('sent_emails table', () => {
  it('has cascade delete on user_id FK', () => {
    expect(sentEmails.userId.notNull).toBe(true);
  });
  it('declares all 6 email types', () => {
    expect(sentEmails.emailType.enumValues).toEqual([
      'welcome', 'purchase_confirmation', 'subscription_canceled',
      'account_deletion', 'trial_ending', 're_engagement_28d',
    ]);
  });
});
