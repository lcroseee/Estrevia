/**
 * Kill switch for the advertising agent.
 *
 * Controlled by the environment variable ADVERTISING_AGENT_ENABLED.
 * Setting it to anything other than the string "true" disables the agent.
 * ADVERTISING_AGENT_DRY_RUN="true" enables dry-run mode (decisions logged,
 * Meta API not called).
 */

export class KillSwitchError extends Error {
  readonly code = 'ADVERTISING_KILL_SWITCH_ENGAGED' as const;

  constructor() {
    super(
      'Advertising agent is disabled. Set ADVERTISING_AGENT_ENABLED=true to enable.',
    );
    this.name = 'KillSwitchError';
    // Maintain prototype chain in compiled JS
    Object.setPrototypeOf(this, KillSwitchError.prototype);
  }
}

/**
 * Returns true when the kill switch is engaged (agent disabled).
 * Pure function — reads process.env only, no side effects.
 */
export function isKillSwitchEngaged(): boolean {
  return process.env.ADVERTISING_AGENT_ENABLED !== 'true';
}

/**
 * Returns true when dry-run mode is active.
 * In dry-run mode, decisions are logged but no Meta API calls are made.
 */
export function isDryRun(): boolean {
  return process.env.ADVERTISING_AGENT_DRY_RUN === 'true';
}

/**
 * Throws KillSwitchError if the kill switch is engaged.
 * Call this at the top of any act-layer function before touching Meta API.
 */
export function assertKillSwitchOff(): void {
  if (isKillSwitchEngaged()) {
    throw new KillSwitchError();
  }
}

/**
 * Health check shape surfaced by Stream 9 health endpoint.
 */
export function getStatus(): { enabled: boolean; dryRun: boolean } {
  return {
    enabled: !isKillSwitchEngaged(),
    dryRun: isDryRun(),
  };
}
