import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isKillSwitchEngaged,
  isDryRun,
  assertKillSwitchOff,
  getStatus,
  KillSwitchError,
} from '../kill-switch';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isKillSwitchEngaged', () => {
  const original = process.env.ADVERTISING_AGENT_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADVERTISING_AGENT_ENABLED;
    } else {
      process.env.ADVERTISING_AGENT_ENABLED = original;
    }
  });

  it('returns true (engaged) when env var is absent', () => {
    delete process.env.ADVERTISING_AGENT_ENABLED;
    expect(isKillSwitchEngaged()).toBe(true);
  });

  it('returns true (engaged) when env var is "false"', () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    expect(isKillSwitchEngaged()).toBe(true);
  });

  it('returns true (engaged) when env var is "1"', () => {
    process.env.ADVERTISING_AGENT_ENABLED = '1';
    expect(isKillSwitchEngaged()).toBe(true);
  });

  it('returns false (not engaged) when env var is "true"', () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    expect(isKillSwitchEngaged()).toBe(false);
  });
});

describe('isDryRun', () => {
  const original = process.env.ADVERTISING_AGENT_DRY_RUN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADVERTISING_AGENT_DRY_RUN;
    } else {
      process.env.ADVERTISING_AGENT_DRY_RUN = original;
    }
  });

  it('returns false when env var is absent', () => {
    delete process.env.ADVERTISING_AGENT_DRY_RUN;
    expect(isDryRun()).toBe(false);
  });

  it('returns true when env var is "true"', () => {
    process.env.ADVERTISING_AGENT_DRY_RUN = 'true';
    expect(isDryRun()).toBe(true);
  });

  it('returns false for other values', () => {
    process.env.ADVERTISING_AGENT_DRY_RUN = 'yes';
    expect(isDryRun()).toBe(false);
  });
});

describe('assertKillSwitchOff', () => {
  const original = process.env.ADVERTISING_AGENT_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADVERTISING_AGENT_ENABLED;
    } else {
      process.env.ADVERTISING_AGENT_ENABLED = original;
    }
  });

  it('throws KillSwitchError when kill switch is engaged', () => {
    delete process.env.ADVERTISING_AGENT_ENABLED;
    expect(() => assertKillSwitchOff()).toThrow(KillSwitchError);
  });

  it('thrown error has correct code', () => {
    delete process.env.ADVERTISING_AGENT_ENABLED;
    try {
      assertKillSwitchOff();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KillSwitchError);
      expect((err as KillSwitchError).code).toBe('ADVERTISING_KILL_SWITCH_ENGAGED');
    }
  });

  it('does not throw when kill switch is off', () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    expect(() => assertKillSwitchOff()).not.toThrow();
  });
});

describe('getStatus', () => {
  const origEnabled = process.env.ADVERTISING_AGENT_ENABLED;
  const origDryRun = process.env.ADVERTISING_AGENT_DRY_RUN;

  afterEach(() => {
    if (origEnabled === undefined) delete process.env.ADVERTISING_AGENT_ENABLED;
    else process.env.ADVERTISING_AGENT_ENABLED = origEnabled;

    if (origDryRun === undefined) delete process.env.ADVERTISING_AGENT_DRY_RUN;
    else process.env.ADVERTISING_AGENT_DRY_RUN = origDryRun;
  });

  it('returns enabled=false and dryRun=false when both vars absent', () => {
    delete process.env.ADVERTISING_AGENT_ENABLED;
    delete process.env.ADVERTISING_AGENT_DRY_RUN;
    expect(getStatus()).toEqual({ enabled: false, dryRun: false });
  });

  it('returns enabled=true when ADVERTISING_AGENT_ENABLED=true', () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    delete process.env.ADVERTISING_AGENT_DRY_RUN;
    expect(getStatus()).toEqual({ enabled: true, dryRun: false });
  });

  it('returns dryRun=true when ADVERTISING_AGENT_DRY_RUN=true', () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    process.env.ADVERTISING_AGENT_DRY_RUN = 'true';
    expect(getStatus()).toEqual({ enabled: true, dryRun: true });
  });
});

describe('KillSwitchError', () => {
  it('is an instance of Error', () => {
    const err = new KillSwitchError();
    expect(err).toBeInstanceOf(Error);
  });

  it('has name KillSwitchError', () => {
    const err = new KillSwitchError();
    expect(err.name).toBe('KillSwitchError');
  });

  it('message describes the issue', () => {
    const err = new KillSwitchError();
    expect(err.message).toContain('ADVERTISING_AGENT_ENABLED');
  });
});
