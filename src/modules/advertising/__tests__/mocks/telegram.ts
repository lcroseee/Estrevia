import { vi } from 'vitest';

export const mockTelegramBot = () => ({
  sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
  sendApprovalRequest: vi.fn().mockResolvedValue({ approved: true }),
});

export type MockTelegramBot = ReturnType<typeof mockTelegramBot>;
