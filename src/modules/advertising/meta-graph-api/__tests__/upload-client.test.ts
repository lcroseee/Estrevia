// src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaUploadClient } from '../upload-client';

const ADSET_EN = 'as_en_999';
const ADSET_ES = 'as_es_888';

beforeEach(() => {
  process.env.META_LAUNCH_ADSET_ID_EN = ADSET_EN;
  process.env.META_LAUNCH_ADSET_ID_ES = ADSET_ES;
});

function chainedFetch(...responses: Response[]) {
  const queue = [...responses];
  return vi.fn(async () => {
    const r = queue.shift();
    if (!r) throw new Error('Unexpected fetch call');
    return r;
  });
}

describe('MetaUploadClient.uploadCreative', () => {
  it('runs 3 sequential calls and returns ad_id', async () => {
    const fetchImpl = chainedFetch(
      // 1. /adimages
      new Response(JSON.stringify({ images: { abc: { hash: 'IMGHASH', url: 'u' } } })),
      // 2. /adcreatives
      new Response(JSON.stringify({ id: 'creative_1' })),
      // 3. /ads
      new Response(JSON.stringify({ id: 'ad_42' })),
    );
    const client = new MetaUploadClient({
      accessToken: 'T', adAccountId: 'act_1', fetchImpl,
    });

    const result = await client.uploadCreative({
      asset_url: 'https://blob/x.png',
      copy: 'Sidereal accuracy',
      cta: 'Calculate your chart',
      locale: 'en',
      tracking: {
        utm_source: 'meta', utm_medium: 'image',
        utm_campaign: 'estrevia_launch_en', utm_content: 'cb_1', utm_term: 'identity_reveal',
      },
    });

    expect(result).toEqual({ creative_id: 'creative_1', ad_id: 'ad_42' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    // /ads call MUST set status=PAUSED
    const adsBody = JSON.parse(
      ((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1]).body as string,
    );
    expect(adsBody.status).toBe('PAUSED');
    expect(adsBody.adset_id).toBe(ADSET_EN);
    expect(adsBody.creative.creative_id).toBe('creative_1');
  });

  it('uses ES adset id when locale=es', async () => {
    const fetchImpl = chainedFetch(
      new Response(JSON.stringify({ images: { x: { hash: 'h', url: 'u' } } })),
      new Response(JSON.stringify({ id: 'cr2' })),
      new Response(JSON.stringify({ id: 'ad_es' })),
    );
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await client.uploadCreative({
      asset_url: 'https://blob/y.png', copy: 'x', cta: 'Calcula', locale: 'es',
      tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'estrevia_launch_es', utm_content: 'b', utm_term: 'authority' },
    });
    const adsBody = JSON.parse(
      ((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1]).body as string,
    );
    expect(adsBody.adset_id).toBe(ADSET_ES);
  });

  it('appends UTM params to link_url in adcreative', async () => {
    const fetchImpl = chainedFetch(
      new Response(JSON.stringify({ images: { x: { hash: 'h', url: 'u' } } })),
      new Response(JSON.stringify({ id: 'cr3' })),
      new Response(JSON.stringify({ id: 'ad3' })),
    );
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await client.uploadCreative({
      asset_url: 'https://blob/z.png', copy: 'x', cta: 'Try', locale: 'en',
      tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'estrevia_launch_en', utm_content: 'cb', utm_term: 'rarity' },
    });
    const creativeBody = JSON.parse(
      ((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1]).body as string,
    );
    const linkData = creativeBody.object_story_spec.link_data;
    expect(linkData.link).toContain('utm_source=meta');
    expect(linkData.link).toContain('utm_campaign=estrevia_launch_en');
    expect(linkData.link).toContain('utm_term=rarity');
  });

  it('propagates error if /adimages fails (no orphan)', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'bad', code: 100 } }), { status: 400 },
    ));
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
    await expect(
      client.uploadCreative({
        asset_url: 'https://blob/x.png', copy: 'x', cta: 'y', locale: 'en',
        tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'c', utm_content: 'cb', utm_term: 't' },
      }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws if META_LAUNCH_ADSET_ID_EN missing', async () => {
    delete process.env.META_LAUNCH_ADSET_ID_EN;
    const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl: vi.fn() });
    await expect(
      client.uploadCreative({
        asset_url: 'u', copy: 'c', cta: 'x', locale: 'en',
        tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'c', utm_content: 'b', utm_term: 't' },
      }),
    ).rejects.toThrow(/META_LAUNCH_ADSET_ID_EN/);
  });
});
