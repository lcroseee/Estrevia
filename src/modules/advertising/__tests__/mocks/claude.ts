import { vi } from 'vitest';

export const mockClaudeApi = () => ({
  moderationCheck: vi.fn().mockResolvedValue({ passed: true, reason: null }),
  brandVoiceScore: vi.fn().mockResolvedValue({
    depth: 8,
    scientific: 8,
    respectful: 9,
    no_manipulation: true,
    overall: 8.3,
  }),
  anomalyExplain: vi.fn().mockResolvedValue('Mercury retrograde started today'),
});

export type MockClaudeApi = ReturnType<typeof mockClaudeApi>;
