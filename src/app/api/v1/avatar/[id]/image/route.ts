/**
 * GET /api/v1/avatar/[id]/image
 *
 * The ONLY way a stored Cosmic Portrait is ever read. In `@vercel/blob`
 * 2.3.3 a private blob is read with `get(pathname, { access: 'private',
 * token })` — there is no signed-URL API (`getDownloadUrl()` only appends
 * `?download=1` and does not authenticate) — so the bytes must stream
 * through this route.
 *
 * Authorisation: allowed when the row's userId matches the caller OR when
 * isShared is true. Otherwise 404 — never 403, since a 403 would confirm
 * the id exists to a caller who isn't allowed to see it.
 *
 * Uses `auth()` (not `requireAuth()`) because an anonymous visitor must be
 * able to read a SHARED portrait; `auth()` returns `{ userId: null }`
 * rather than throwing.
 */

import { auth } from '@clerk/nextjs/server';
import { get } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { avatars } from '@/shared/lib/schema';

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { userId } = await auth();

  const db = getDb();
  const rows = await db.select().from(avatars).where(eq(avatars.id, id)).limit(1);
  if (rows.length === 0) return notFound();

  const row = rows[0];
  const isOwner = row.userId === userId;
  if (!isOwner && !row.isShared) return notFound();

  const result = await get(row.blobPathname, {
    access: 'private',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!result || result.statusCode !== 200) return notFound();

  const headers = new Headers();
  headers.set('content-type', result.blob.contentType);
  headers.set(
    'cache-control',
    isOwner ? 'private, max-age=0, must-revalidate' : 'public, max-age=3600',
  );

  return new Response(result.stream, { headers });
}
