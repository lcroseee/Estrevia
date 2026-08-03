// src/shared/lib/image-prep.ts

/**
 * Client-side selfie preparation.
 *
 * Re-encoding through a canvas discards ALL EXIF metadata — including GPS
 * coordinates — on the user's own device, before a single byte is uploaded.
 * It also shrinks a typical 4 MB phone photo to roughly 300 KB, which makes
 * the request faster and the model call cheaper.
 *
 * `sharp` is deliberately not used: it is not declared in package.json and
 * only resolves transitively through @vercel/og.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_EDGE_PX = 1024;
export const OUTPUT_TYPE = 'image/jpeg';
export const OUTPUT_QUALITY = 0.9;

/**
 * SVG is excluded on purpose — it can carry script.
 *
 * HEIC/HEIF are excluded on purpose too: `createImageBitmap` (used below)
 * cannot decode HEIC/HEIF outside iOS Safari, so a desktop user picking an
 * AirDropped HEIC would previously pass this check and only fail later,
 * inside prepareSelfie, surfacing as the generic invalid-image error. See
 * I4, fix-wave-D-report.md.
 */
export const ACCEPTED_INPUT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export function isAcceptedImageType(type: string): boolean {
  return (ACCEPTED_INPUT_TYPES as readonly string[]).includes(type);
}

/** Scales to fit `maxEdge` while preserving aspect ratio. Never returns 0. */
export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * Decodes, downsizes, and re-encodes a selfie as JPEG.
 * Browser-only: requires createImageBitmap and canvas.
 */
export async function prepareSelfie(file: File): Promise<Blob> {
  if (!isAcceptedImageType(file.type)) {
    throw new Error('UNSUPPORTED_TYPE');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY),
    );
    if (!blob) throw new Error('ENCODE_FAILED');
    return blob;
  } finally {
    bitmap.close();
  }
}
