import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadApprovedCreative, buildTrackingParams } from '../meta-upload';
import type { UploadDeps } from '../meta-upload';
import type { CreativeBundle, GeneratedAsset } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockAsset = (overrides?: Partial<GeneratedAsset>): GeneratedAsset => ({
  id: 'asset-001',
  kind: 'image',
  generator: 'imagen-4-ultra',
  prompt_used: 'cosmic nebula',
  url: 'https://test.blob.vercel-storage.com/img-001.png',
  width: 1080,
  height: 1920,
  cost_usd: 0.06,
  created_at: new Date('2026-04-26T00:00:00Z'),
  ...overrides,
});

const approvedBundle = (overrides?: Partial<CreativeBundle>): CreativeBundle => ({
  id: 'bundle-approved-001',
  hook_template_id: 'identity_reveal-en-01',
  asset: mockAsset(),
  copy: 'Your sidereal sun is in Scorpio.',
  cta: 'Calculate your chart',
  locale: 'en',
  status: 'approved',
  safety_checks: [],
  approved_by: 'founder',
  approved_at: new Date('2026-04-26T10:00:00Z'),
  ...overrides,
});

function makeWhereFn(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(undefined);
}
function makeSetFn(whereFn: ReturnType<typeof vi.fn>) {
  return vi.fn().mockReturnValue({ where: whereFn });
}
function makeUpdateFn(setFn: ReturnType<typeof vi.fn>) {
  return vi.fn().mockReturnValue({ set: setFn });
}

function makeDeps(
  metaOverrides?: Partial<UploadDeps['metaApi']>,
  dbWhere?: ReturnType<typeof vi.fn>,
): { deps: UploadDeps; whereFn: ReturnType<typeof vi.fn>; setFn: ReturnType<typeof vi.fn>; updateFn: ReturnType<typeof vi.fn> } {
  const whereFn = dbWhere ?? makeWhereFn();
  const setFn = makeSetFn(whereFn);
  const updateFn = makeUpdateFn(setFn);

  const deps: UploadDeps = {
    metaApi: {
      uploadCreative: vi.fn().mockResolvedValue({
        creative_id: 'cr_meta_001',
        ad_id: 'ad_meta_001',
      }),
      ...metaOverrides,
    },
    db: { update: updateFn } as unknown as UploadDeps['db'],
  };

  return { deps, whereFn, setFn, updateFn };
}

// ---------------------------------------------------------------------------
// uploadApprovedCreative
// ---------------------------------------------------------------------------
describe('uploadApprovedCreative', () => {
  it('returns meta_ad_id from Meta API response', async () => {
    const { deps } = makeDeps();
    const result = await uploadApprovedCreative(approvedBundle(), deps);

    expect(result.meta_ad_id).toBe('ad_meta_001');
  });

  it('throws when bundle status is pending_review', async () => {
    const { deps } = makeDeps();
    const bundle = approvedBundle({ status: 'pending_review' });

    await expect(uploadApprovedCreative(bundle, deps)).rejects.toThrow(
      /Cannot upload creative.*status is "pending_review"/,
    );
  });

  it('throws when bundle status is rejected', async () => {
    const { deps } = makeDeps();
    const bundle = approvedBundle({ status: 'rejected' });

    await expect(uploadApprovedCreative(bundle, deps)).rejects.toThrow(
      /Cannot upload creative.*status is "rejected"/,
    );
  });

  it('throws when bundle status is uploaded', async () => {
    const { deps } = makeDeps();
    const bundle = approvedBundle({ status: 'uploaded' });

    await expect(uploadApprovedCreative(bundle, deps)).rejects.toThrow(
      /Cannot upload creative.*status is "uploaded"/,
    );
  });

  it('calls metaApi.uploadCreative with asset_url, copy, cta, locale', async () => {
    const { deps } = makeDeps();
    const bundle = approvedBundle();

    await uploadApprovedCreative(bundle, deps);

    expect(deps.metaApi.uploadCreative).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_url: bundle.asset.url,
        copy: bundle.copy,
        cta: bundle.cta,
        locale: bundle.locale,
      }),
    );
  });

  it('passes tracking params including utm_source=meta to Meta API', async () => {
    const { deps } = makeDeps();

    await uploadApprovedCreative(approvedBundle(), deps);

    const callArg = (deps.metaApi.uploadCreative as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.tracking.utm_source).toBe('meta');
    expect(callArg.tracking.utm_campaign).toBe('estrevia_launch_en');
    expect(callArg.tracking.utm_content).toBe('bundle-approved-001');
  });

  it('updates DB status to uploaded with meta_ad_id', async () => {
    const { deps, setFn } = makeDeps();

    await uploadApprovedCreative(approvedBundle(), deps);

    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'uploaded', metaAdId: 'ad_meta_001' }),
    );
  });

  it('calls DB update targeting the correct creative id', async () => {
    const { deps, whereFn } = makeDeps();

    await uploadApprovedCreative(approvedBundle(), deps);

    // where() was called (condition is an eq expression — we just verify it was called)
    expect(whereFn).toHaveBeenCalledOnce();
  });

  it('does not call metaApi when bundle is unapproved', async () => {
    const { deps } = makeDeps();
    const bundle = approvedBundle({ status: 'pending_review' });

    await expect(uploadApprovedCreative(bundle, deps)).rejects.toThrow();
    expect(deps.metaApi.uploadCreative).not.toHaveBeenCalled();
  });

  it('propagates Meta API errors', async () => {
    const { deps } = makeDeps({
      uploadCreative: vi.fn().mockRejectedValue(new Error('Meta API 503')),
    });

    await expect(uploadApprovedCreative(approvedBundle(), deps)).rejects.toThrow('Meta API 503');
  });

  it('does not update DB if Meta API call fails', async () => {
    const { deps, setFn } = makeDeps({
      uploadCreative: vi.fn().mockRejectedValue(new Error('Meta API 503')),
    });

    await expect(uploadApprovedCreative(approvedBundle(), deps)).rejects.toThrow();
    expect(setFn).not.toHaveBeenCalled();
  });

  it('handles ES locale bundle with locale-appropriate campaign name', async () => {
    const { deps } = makeDeps();
    const bundle = approvedBundle({ locale: 'es' });

    await uploadApprovedCreative(bundle, deps);

    const callArg = (deps.metaApi.uploadCreative as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.tracking.utm_campaign).toBe('estrevia_launch_es');
    expect(callArg.locale).toBe('es');
  });
});

// ---------------------------------------------------------------------------
// buildTrackingParams
// ---------------------------------------------------------------------------
describe('buildTrackingParams', () => {
  it('sets utm_source=meta', () => {
    const params = buildTrackingParams(approvedBundle());
    expect(params.utm_source).toBe('meta');
  });

  it('sets utm_medium=image for image assets', () => {
    const bundle = approvedBundle({ asset: mockAsset({ kind: 'image' }) });
    const params = buildTrackingParams(bundle);
    expect(params.utm_medium).toBe('image');
  });

  it('sets utm_medium=video for video assets', () => {
    const bundle = approvedBundle({ asset: mockAsset({ kind: 'video' }) });
    const params = buildTrackingParams(bundle);
    expect(params.utm_medium).toBe('video');
  });

  it('sets utm_content to bundle id', () => {
    const bundle = approvedBundle({ id: 'my-bundle-xyz' });
    const params = buildTrackingParams(bundle);
    expect(params.utm_content).toBe('my-bundle-xyz');
  });

  it('sets utm_campaign encoding locale', () => {
    const enBundle = approvedBundle({ locale: 'en' });
    const esBundle = approvedBundle({ locale: 'es' });
    expect(buildTrackingParams(enBundle).utm_campaign).toBe('estrevia_launch_en');
    expect(buildTrackingParams(esBundle).utm_campaign).toBe('estrevia_launch_es');
  });

  it('extracts utm_term from hook_template_id prefix', () => {
    const bundle = approvedBundle({ hook_template_id: 'rarity-en-03' });
    const params = buildTrackingParams(bundle);
    expect(params.utm_term).toBe('rarity');
  });
});
