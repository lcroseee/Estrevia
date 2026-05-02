// src/modules/advertising/meta-graph-api/upload-client.ts
import type { MetaApiClient } from '@/modules/advertising/creative-gen/upload/meta-upload';
import type { MetaIdResponse, MetaAdImagesResponse } from './types';
import { MetaGraphApiBase } from './base';

const SITE_BASE = 'https://estrevia.app';

export class MetaUploadClient extends MetaGraphApiBase implements MetaApiClient {
  async uploadCreative(opts: {
    asset_url: string;
    copy: string;
    cta: string;
    locale: string;
    tracking: {
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
      utm_content: string;
      utm_term: string;
    };
  }): Promise<{ creative_id: string; ad_id: string }> {
    const adsetId = this.getAdSetId(opts.locale);

    // Step 1: Upload image as base64 bytes.
    // Meta's url-based upload (`{url}` param) requires App Review for an
    // "image fetch via URL" capability the App lacks; bytes-based upload
    // works with regular ads_management scope. We download from Vercel Blob
    // ourselves and forward as base64.
    const assetBase64 = await this.downloadAssetAsBase64(opts.asset_url);
    const imageRes = await this.request<MetaAdImagesResponse>(
      'POST',
      `/${this.adAccountId}/adimages`,
      { bytes: assetBase64 },
    );
    const imageHash = Object.values(imageRes.images)[0]?.hash;
    if (!imageHash) {
      throw new Error('Meta /adimages returned no hash');
    }

    // Step 2: Create AdCreative
    const linkUrl = this.buildLinkUrl(opts.tracking);
    const creativeRes = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/adcreatives`,
      {
        name: `creative_${opts.tracking.utm_content}`,
        object_story_spec: {
          link_data: {
            image_hash: imageHash,
            message: opts.copy,
            link: linkUrl,
            name: opts.copy.slice(0, 40),
            call_to_action: {
              type: 'LEARN_MORE',
              value: { link: linkUrl },
            },
          },
        },
      },
    );

    // Step 3: Create Ad (PAUSED)
    const adRes = await this.request<MetaIdResponse>(
      'POST',
      `/${this.adAccountId}/ads`,
      {
        name: `ad_${opts.tracking.utm_content}`,
        adset_id: adsetId,
        creative: { creative_id: creativeRes.id },
        status: 'PAUSED',
      },
    );

    return { creative_id: creativeRes.id, ad_id: adRes.id };
  }

  private async downloadAssetAsBase64(url: string): Promise<string> {
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`Failed to download asset ${url}: HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.toString('base64');
  }

  private getAdSetId(locale: string): string {
    const envKey = locale === 'es' ? 'META_LAUNCH_ADSET_ID_ES' : 'META_LAUNCH_ADSET_ID_EN';
    const id = process.env[envKey];
    if (!id) throw new Error(`Required env var ${envKey} is not set. Run setup-meta-campaign.ts first.`);
    return id;
  }

  private buildLinkUrl(tracking: {
    utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; utm_term: string;
  }): string {
    const url = new URL('/', SITE_BASE);
    url.searchParams.set('utm_source', tracking.utm_source);
    url.searchParams.set('utm_medium', tracking.utm_medium);
    url.searchParams.set('utm_campaign', tracking.utm_campaign);
    url.searchParams.set('utm_content', tracking.utm_content);
    url.searchParams.set('utm_term', tracking.utm_term);
    return url.toString();
  }
}
