'use server';

/**
 * Server Actions for /admin/advertising/recon-state.
 *
 * The reconciler global-suspend state is read on every page load (see page.tsx).
 * The founder unblock button calls `resumeNowAction` to clear the suspended
 * flag immediately — overriding the 24h auto-resume window.
 *
 * Auth: this route is gated by the admin Clerk allowlist in the parent layout
 * (`src/app/admin/advertising/layout.tsx`); no extra auth check needed here.
 */

import { revalidatePath } from 'next/cache';
import { resume } from '@/modules/advertising/perceive/recon-state-store';

export async function resumeNowAction(): Promise<{ ok: true }> {
  await resume('founder_manual_override');
  revalidatePath('/admin/advertising/recon-state');
  return { ok: true };
}
