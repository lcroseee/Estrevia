// src/modules/advertising/meta-graph-api/__tests__/integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMetaUploadClient, createMetaAdClient } from '../index';

// Capture env snapshot before any test mutation
const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'TOKEN';
  process.env.META_AD_ACCOUNT_ID = 'act_1';
  process.env.META_LAUNCH_ADSET_ID_EN = 'as_en';
  process.env.META_LAUNCH_ADSET_ID_ES = 'as_es';
  // Remove Vitest markers so guard doesn't trigger for tests that need factories to work
  delete process.env.VITEST;
  // Cast to mutable record to bypass TypeScript's readonly declaration on NODE_ENV
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
});

afterEach(() => {
  // Restore env by mutating individual keys (process.env cannot be replaced in Node)
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIG_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIG_ENV)) {
    if (value !== undefined) process.env[key] = value;
  }
});

describe('factory', () => {
  it('createMetaUploadClient reads env and returns client', () => {
    const client = createMetaUploadClient();
    expect(client).toBeDefined();
    expect(typeof client.uploadCreative).toBe('function');
  });

  it('createMetaAdClient reads env and returns client', () => {
    const client = createMetaAdClient();
    expect(typeof client.pauseAd).toBe('function');
    expect(typeof client.createCampaign).toBe('function');
  });

  it('throws if META_ACCESS_TOKEN missing', () => {
    delete process.env.META_ACCESS_TOKEN;
    expect(() => createMetaUploadClient()).toThrow(/META_ACCESS_TOKEN/);
  });

  it('throws if running in test mode (VITEST=true)', () => {
    process.env.VITEST = 'true';
    expect(() => createMetaUploadClient()).toThrow(/Use mock in tests/);
  });

  it('throws if NODE_ENV=test', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    expect(() => createMetaUploadClient()).toThrow(/Use mock in tests/);
  });
});

describe('integration: full upload flow through factory client', () => {
  it('runs all 3 calls and returns ad_id', async () => {
    const responses = [
      new Response(JSON.stringify({ images: { x: { hash: 'H', url: 'u' } } })),
      new Response(JSON.stringify({ id: 'cr1' })),
      new Response(JSON.stringify({ id: 'ad1' })),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);

    // For this integration test we exercise the class directly with injected fetch.
    // Factory env-guard validation is covered in the describe('factory') suite above.
    const { MetaUploadClient } = await import('../upload-client');
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    const res = await client.uploadCreative({
      asset_url: 'u',
      copy: 'c',
      cta: 'x',
      locale: 'en',
      tracking: {
        utm_source: 'meta',
        utm_medium: 'image',
        utm_campaign: 'k',
        utm_content: 'b',
        utm_term: 't',
      },
    });
    expect(res.ad_id).toBe('ad1');
  });
});
