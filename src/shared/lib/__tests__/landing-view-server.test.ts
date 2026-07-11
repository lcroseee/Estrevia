import { describe, it, expect, vi, beforeEach } from 'vitest';

const trackServerEventMock = vi.hoisted(() => vi.fn());
const cookieGetMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/analytics', () => ({ trackServerEvent: trackServerEventMock }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGetMock }),
}));

import { captureServerLandingView } from '../landing-view-server';

beforeEach(() => {
  trackServerEventMock.mockReset();
  cookieGetMock.mockReset();
});

describe('captureServerLandingView (Track 5b)', () => {
  it('captures landing_view with the anonymous_id cookie as distinctId', async () => {
    cookieGetMock.mockReturnValue({ value: 'anon-uuid-1' });
    await captureServerLandingView('es');
    expect(trackServerEventMock).toHaveBeenCalledWith('anon-uuid-1', 'landing_view', {
      locale: 'es',
      source: 'server',
    });
  });

  it('falls back to a random distinctId when the cookie is absent', async () => {
    cookieGetMock.mockReturnValue(undefined);
    await captureServerLandingView('en');
    expect(trackServerEventMock).toHaveBeenCalledTimes(1);
    expect(typeof trackServerEventMock.mock.calls[0][0]).toBe('string');
    expect(trackServerEventMock.mock.calls[0][0].length).toBeGreaterThan(10);
  });

  it('never throws when analytics or cookies fail', async () => {
    cookieGetMock.mockImplementation(() => {
      throw new Error('no request scope');
    });
    await expect(captureServerLandingView('en')).resolves.toBeUndefined();
    expect(trackServerEventMock).not.toHaveBeenCalled();
  });
});
