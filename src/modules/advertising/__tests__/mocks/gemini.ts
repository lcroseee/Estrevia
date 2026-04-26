import { vi } from 'vitest';

export const mockGeminiApi = () => ({
  generateImage: vi.fn().mockResolvedValue({
    url: 'https://test.blob.vercel-storage.com/img-001.png',
    width: 1080,
    height: 1920,
    cost_usd: 0.06,
  }),
  generateVideo: vi.fn().mockResolvedValue({
    url: 'https://test.blob.vercel-storage.com/vid-001.mp4',
    width: 1080,
    height: 1920,
    duration_sec: 15,
    cost_usd: 0.75,
  }),
});

export type MockGeminiApi = ReturnType<typeof mockGeminiApi>;
