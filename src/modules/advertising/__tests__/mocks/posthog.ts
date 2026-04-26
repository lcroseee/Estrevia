import { vi } from 'vitest';
import { mockFunnelSnapshot } from '../fixtures';

export const mockPosthog = () => ({
  getFunnel: vi.fn().mockResolvedValue(mockFunnelSnapshot()),
  getEventsByUtm: vi.fn().mockResolvedValue([]),
});

export type MockPosthog = ReturnType<typeof mockPosthog>;
