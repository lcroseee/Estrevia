/**
 * POST /api/v1/unsubscribe?token=…  — RFC 8058 one-click unsubscribe endpoint.
 *
 * The `List-Unsubscribe` email header points here; RFC 8058 mail clients (Gmail,
 * Apple Mail) POST `List-Unsubscribe=One-Click` to it. The marketing footer's
 * human link still points to the /unsubscribe PAGE (GET, with confirmation UI).
 *
 * POST verifies the HMAC token and flips suppression (user.marketing_email_opt_in
 * = false, or email_leads.unsubscribed_at). GET returns 405 so link-prefetchers /
 * scanners cannot trigger a false unsubscribe (the header path is POST-only).
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyUnsubscribeToken } from '@/shared/lib/unsubscribe-token';
import { getDb } from '@/shared/lib/db';
import { emailLeads, users } from '@/shared/lib/schema';

export const dynamic = 'force-dynamic';

async function processToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  let kind: 'user' | 'lead';
  let id: string;
  try {
    const result = await verifyUnsubscribeToken(token);
    if (!result.ok) return false;
    kind = result.kind;
    id = result.id;
  } catch {
    return false;
  }
  try {
    const db = getDb();
    if (kind === 'user') {
      await db.update(users).set({ marketingEmailOptIn: false }).where(eq(users.id, id));
    } else {
      await db.update(emailLeads).set({ unsubscribedAt: new Date() }).where(eq(emailLeads.id, id));
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token');
  const ok = await processToken(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export function GET(): NextResponse {
  // Human unsubscribe goes to the /unsubscribe page; the header path is POST-only
  // so prefetchers/scanners can't false-unsubscribe via a GET.
  return NextResponse.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
