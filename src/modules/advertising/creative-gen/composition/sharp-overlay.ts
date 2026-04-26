/**
 * sharp-overlay.ts
 *
 * Composes a text overlay on top of an AI-generated background image using
 * Sharp's composite() API with an SVG text layer.
 *
 * Technique: AI generates the background (atmosphere/aesthetics).
 * Code renders the text (100% accuracy, free A/B copy variations).
 * This avoids the $0.02-0.06 per image cost of regenerating with different copy.
 *
 * Usage:
 *   const png = await composeWithText(backgroundBuffer, 'Hook copy here', {
 *     x: 540, y: 1600, anchor: 'bottom-center',
 *   });
 */

import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextAnchor = 'top-left' | 'center' | 'bottom-center';

export interface TextPosition {
  /** X offset from left edge (pixels). For center/bottom-center, this is the center X. */
  x: number;
  /** Y offset from top edge (pixels). For bottom-center, this is the Y from top of text box. */
  y: number;
  anchor: TextAnchor;
}

export interface OverlayFont {
  /** Font size in px. Default: 60 */
  size?: number;
  /** CSS color string. Default: '#FFFFFF' */
  color?: string;
  /** Font weight: 'normal' | 'bold'. Default: 'bold' */
  weight?: 'normal' | 'bold';
  /** CSS font-family. Default: 'sans-serif' */
  family?: string;
  /** Letter spacing in px. Default: 0 */
  letterSpacing?: number;
  /** Max line width in chars before wrapping. Default: 30 */
  maxLineLength?: number;
  /** Shadow: adds dark drop-shadow for readability on busy backgrounds */
  shadow?: boolean;
}

// ---------------------------------------------------------------------------
// SVG text overlay builder
// ---------------------------------------------------------------------------

const DEFAULT_FONT: Required<OverlayFont> = {
  size: 60,
  color: '#FFFFFF',
  weight: 'bold',
  family: 'sans-serif',
  letterSpacing: 0,
  maxLineLength: 30,
  shadow: true,
};

/**
 * Splits text at word boundaries so each line is at most maxLineLength chars.
 */
function wrapText(text: string, maxLen: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Builds an SVG string that renders the text. The SVG canvas is sized to the
 * background image so Sharp can composite it without transformation.
 */
function buildSvgOverlay(
  text: string,
  position: TextPosition,
  font: Required<OverlayFont>,
  imageWidth: number,
  imageHeight: number,
): string {
  const lines = wrapText(text, font.maxLineLength);
  const lineHeight = font.size * 1.3;
  const totalTextHeight = lines.length * lineHeight;

  // Compute text block origin based on anchor
  let blockX = position.x;
  let blockY = position.y;

  // For anchor modes:
  //   top-left:      (x, y) = top-left of text block
  //   center:        (x, y) = center of text block (text-anchor: middle)
  //   bottom-center: (x, y) = horizontal center, vertical bottom of text block

  const textAnchor =
    position.anchor === 'top-left' ? 'start' : 'middle';

  if (position.anchor === 'bottom-center') {
    blockY = position.y - totalTextHeight;
  }

  // Filter special SVG characters
  function escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  const shadowFilter = font.shadow
    ? `<defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.8)" flood-opacity="1"/>
        </filter>
      </defs>`
    : '';

  const filterAttr = font.shadow ? ' filter="url(#shadow)"' : '';

  const textElements = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${blockX}" dy="${i === 0 ? blockY + font.size : lineHeight}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  // Build individual tspan with absolute Y positions for clarity
  const tspans = lines
    .map((line, i) => {
      const y = blockY + font.size + i * lineHeight;
      return `<text
          x="${blockX}"
          y="${y}"
          font-family="${escapeXml(font.family)}"
          font-size="${font.size}px"
          font-weight="${font.weight}"
          fill="${escapeXml(font.color)}"
          text-anchor="${textAnchor}"
          letter-spacing="${font.letterSpacing}"
          ${filterAttr}
        >${escapeXml(line)}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}">
  ${shadowFilter}
  ${tspans}
</svg>`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Composites a text overlay on top of a PNG background buffer.
 *
 * @param background   PNG or JPEG buffer of the AI-generated background
 * @param text         The copy to render (supports multi-line word wrapping)
 * @param position     Where to place the text on the image
 * @param font         Optional font/style settings
 * @returns            PNG buffer with text composited on background
 */
export async function composeWithText(
  background: Buffer,
  text: string,
  position: TextPosition,
  font?: OverlayFont,
): Promise<Buffer> {
  const resolvedFont: Required<OverlayFont> = {
    ...DEFAULT_FONT,
    ...font,
  };

  // Get background image dimensions
  const meta = await sharp(background).metadata();
  const imageWidth = meta.width ?? 1080;
  const imageHeight = meta.height ?? 1920;

  const svgOverlay = buildSvgOverlay(
    text,
    position,
    resolvedFont,
    imageWidth,
    imageHeight,
  );

  const svgBuffer = Buffer.from(svgOverlay);

  return sharp(background)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
