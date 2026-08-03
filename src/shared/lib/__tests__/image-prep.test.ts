// @vitest-environment jsdom
// src/shared/lib/__tests__/image-prep.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeTargetSize,
  isAcceptedImageType,
  prepareSelfie,
  MAX_EDGE_PX,
  MAX_UPLOAD_BYTES,
  OUTPUT_QUALITY,
  ACCEPTED_INPUT_TYPES,
} from '../image-prep';

describe('computeTargetSize', () => {
  it('leaves a small image untouched', () => {
    expect(computeTargetSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('caps the long edge at 1024 and preserves aspect ratio, landscape', () => {
    expect(computeTargetSize(4032, 3024)).toEqual({ width: 1024, height: 768 });
  });

  it('caps the long edge at 1024 and preserves aspect ratio, portrait', () => {
    expect(computeTargetSize(3024, 4032)).toEqual({ width: 768, height: 1024 });
  });

  it('handles an exact square', () => {
    expect(computeTargetSize(2000, 2000)).toEqual({ width: 1024, height: 1024 });
  });

  it('never returns a zero dimension for extreme aspect ratios', () => {
    const r = computeTargetSize(10000, 3);
    expect(r.width).toBe(1024);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it('respects an explicit maxEdge override', () => {
    expect(computeTargetSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });
});

describe('isAcceptedImageType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (t) => {
    expect(isAcceptedImageType(t)).toBe(true);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', ''])('rejects %s', (t) => {
    expect(isAcceptedImageType(t)).toBe(false);
  });

  it('rejects SVG explicitly — it can carry script', () => {
    expect(ACCEPTED_INPUT_TYPES).not.toContain('image/svg+xml');
  });

  // I4: createImageBitmap cannot decode HEIC/HEIF outside iOS Safari, so a
  // desktop user picking an AirDropped HEIC previously passed this check
  // and only failed later, inside prepareSelfie, with the generic
  // invalid-image error. Rejecting it here — before any decode attempt —
  // is the chosen fix (see fix-wave-D-report.md for the alternative
  // considered: mapping the decode failure to a dedicated message).
  it.each(['image/heic', 'image/heif'])(
    'rejects %s — createImageBitmap cannot decode it outside iOS Safari',
    (t) => {
      expect(isAcceptedImageType(t)).toBe(false);
      expect(ACCEPTED_INPUT_TYPES).not.toContain(t);
    },
  );
});

describe('constants', () => {
  it('caps uploads at 8 MB and the long edge at 1024 px', () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_EDGE_PX).toBe(1024);
  });
});

// ---------------------------------------------------------------------
// prepareSelfie
//
// jsdom has no real canvas or image decoder, so every test below stubs
// the two browser APIs the function calls: `createImageBitmap` and
// `document.createElement('canvas')`. These tests prove the RE-ENCODE
// PATH runs end-to-end and produces a JPEG at the expected size/quality.
// They do NOT and CANNOT prove that a real browser encoder actually
// strips EXIF/GPS bytes from a real photo — jsdom never decodes real
// image bytes, so there is nothing here that could carry EXIF in the
// first place. That guarantee rests on the browser's own canvas
// re-encode implementation, which is outside the reach of a unit test.
// ---------------------------------------------------------------------

interface FakeBitmap {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
}

function makeFile(opts: { type?: string; size?: number; name?: string } = {}): File {
  const { type = 'image/jpeg', size = 1024, name = 'selfie.jpg' } = opts;
  const file = new File([''], name, { type });
  // Real File.size reflects actual byte content; overriding it directly
  // avoids allocating multi-megabyte strings just to exceed MAX_UPLOAD_BYTES.
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
}

function stubCreateImageBitmap(bitmap: FakeBitmap): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => bitmap as unknown as ImageBitmap);
  vi.stubGlobal('createImageBitmap', fn);
  return fn;
}

function stubCanvas(toBlobResult: Blob | null) {
  const drawImage = vi.fn();
  const toBlob = vi.fn((cb: BlobCallback, _type?: string, _quality?: number) => cb(toBlobResult));
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage }) as unknown as CanvasRenderingContext2D),
    toBlob,
  };
  const createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') return fakeCanvas as unknown as HTMLCanvasElement;
      throw new Error(`unexpected document.createElement(${tagName}) in prepareSelfie test`);
    }) as typeof document.createElement);
  return { fakeCanvas, drawImage, toBlob, createElementSpy };
}

describe('prepareSelfie', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('decodes the file via createImageBitmap and closes the bitmap afterwards (no leak)', async () => {
    const bitmap: FakeBitmap = { width: 640, height: 480, close: vi.fn() };
    const createImageBitmapMock = stubCreateImageBitmap(bitmap);
    stubCanvas(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const file = makeFile();

    const result = await prepareSelfie(file);

    expect(createImageBitmapMock).toHaveBeenCalledWith(file);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Blob);
  });

  it('closes the bitmap even when re-encoding fails downstream (no leak on the error path)', async () => {
    const bitmap: FakeBitmap = { width: 640, height: 480, close: vi.fn() };
    stubCreateImageBitmap(bitmap);
    stubCanvas(null); // toBlob -> null -> ENCODE_FAILED

    await expect(prepareSelfie(makeFile())).rejects.toThrow('ENCODE_FAILED');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('sizes the canvas per computeTargetSize, downscaling an oversized bitmap', async () => {
    stubCreateImageBitmap({ width: 4032, height: 3024, close: vi.fn() });
    const { fakeCanvas } = stubCanvas(new Blob(['jpeg'], { type: 'image/jpeg' }));

    await prepareSelfie(makeFile());

    expect(fakeCanvas.width).toBe(1024);
    expect(fakeCanvas.height).toBe(768);
  });

  it(
    're-encodes through toBlob as image/jpeg at OUTPUT_QUALITY — this re-encode IS the EXIF ' +
      'strip; it proves the path runs and yields a JPEG, not that a real encoder drops metadata',
    async () => {
      stubCreateImageBitmap({ width: 640, height: 480, close: vi.fn() });
      const { toBlob } = stubCanvas(new Blob(['jpeg'], { type: 'image/jpeg' }));

      await prepareSelfie(makeFile());

      expect(toBlob).toHaveBeenCalledTimes(1);
      const [, type, quality] = toBlob.mock.calls[0];
      expect(type).toBe('image/jpeg');
      expect(quality).toBe(OUTPUT_QUALITY);
    },
  );

  it('rejects an unsupported MIME type with UNSUPPORTED_TYPE and never touches the canvas', async () => {
    const createImageBitmapMock = stubCreateImageBitmap({ width: 640, height: 480, close: vi.fn() });
    const createElementSpy = vi.spyOn(document, 'createElement');
    const file = makeFile({ type: 'image/gif' });

    await expect(prepareSelfie(file)).rejects.toThrow('UNSUPPORTED_TYPE');
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(createElementSpy).not.toHaveBeenCalledWith('canvas');
  });

  it('rejects a file over MAX_UPLOAD_BYTES with FILE_TOO_LARGE and never touches the canvas', async () => {
    const createImageBitmapMock = stubCreateImageBitmap({ width: 640, height: 480, close: vi.fn() });
    const createElementSpy = vi.spyOn(document, 'createElement');
    const file = makeFile({ size: MAX_UPLOAD_BYTES + 1 });

    await expect(prepareSelfie(file)).rejects.toThrow('FILE_TOO_LARGE');
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(createElementSpy).not.toHaveBeenCalledWith('canvas');
  });

  it('rejects with ENCODE_FAILED when toBlob yields null (e.g. a tainted or unsupported canvas)', async () => {
    stubCreateImageBitmap({ width: 640, height: 480, close: vi.fn() });
    stubCanvas(null);

    await expect(prepareSelfie(makeFile())).rejects.toThrow('ENCODE_FAILED');
  });
});
