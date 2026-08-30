export const PAYWALL_EXIT_STORAGE_KEY = 'estrevia_paywall_exit_at';
export const PAYWALL_EXIT_QUALIFY_MS = 2_000;
export const PAYWALL_EXIT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export type PaywallDismissMethod =
  | 'close_button'
  | 'backdrop'
  | 'escape'
  | 'keep_free';

export type PaywallStage = 'offer' | 'exit';

export function shouldShowPaywallExitSheet(
  dwellMs: number,
  nowMs: number,
  readStoredAt: () => string | null,
): boolean {
  if (dwellMs < PAYWALL_EXIT_QUALIFY_MS) return false;
  let raw: string | null;
  try {
    raw = readStoredAt();
  } catch {
    return false;
  }
  if (raw == null || raw === '') return true;
  const at = Number(raw);
  if (!Number.isFinite(at)) return true;
  return nowMs - at >= PAYWALL_EXIT_COOLDOWN_MS;
}
