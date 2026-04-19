export const SITE_NAME = 'Estrevia';

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit && !explicit.startsWith('http://localhost')) {
    return explicit.replace(/\/$/, '');
  }
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ?? process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  return 'https://estrevia.app';
}

export const SITE_URL = resolveSiteUrl();
export const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-image`;
export const TWITTER_HANDLE = '@estrevia_app';
export const SITE_DESCRIPTION =
  'Sidereal astrology platform — natal charts, planetary hours, esoteric correspondences';

export const TITLE_SUFFIX = ` | ${SITE_NAME}`;
export const MAX_TITLE_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 155;

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
