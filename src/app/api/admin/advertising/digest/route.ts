/**
 * GET /api/admin/advertising/digest?type=daily
 *
 * Pre-rendered markdown digest for direct presentation in the Cowork
 * inbox. Same Bearer auth as /status (ADVERTISING_STATUS_BEARER).
 *
 * Builds the report via `buildDigestData()` — the same builder
 * `TelegramBot.sendDailyDigest()` calls — then renders with
 * `formatMarkdown()` for CommonMark output. The Telegram bot uses
 * `formatTelegram()` against the identical report, guaranteeing
 * cross-channel alignment.
 *
 * `type=weekly` is reserved; not yet implemented (would call a separate
 * weekly builder once weekly metrics are exposed).
 *
 * Response: text/markdown body.
 */

import { NextResponse } from 'next/server';
import { buildDigestData } from '@/modules/advertising/alerts/digest-builder';
import { formatMarkdown } from '@/modules/advertising/alerts/digest-renderers';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.ADVERTISING_STATUS_BEARER;
  if (!expected || !auth.startsWith('Bearer ') || auth.slice(7) !== expected) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    );
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'daily';

  if (type !== 'daily' && type !== 'weekly') {
    return NextResponse.json(
      { error: 'INVALID_TYPE', message: 'type must be daily or weekly' },
      { status: 400 },
    );
  }

  if (type === 'weekly') {
    return NextResponse.json(
      { error: 'NOT_IMPLEMENTED', message: 'weekly digest builder not yet wired; deferred to Phase 4' },
      { status: 501 },
    );
  }

  const report = await buildDigestData();
  const markdown = formatMarkdown(report);

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
