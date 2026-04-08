'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Estrevia] Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Decorative star */}
        <div className="mx-auto w-16 h-16 rounded-full border border-[#C8A84B]/30 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C8A84B" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" opacity="0.4" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" opacity="0.3" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-white/90 font-[family-name:var(--font-geist-sans)]">
          Something went wrong
        </h1>

        <p className="text-sm text-white/50 leading-relaxed">
          An unexpected error occurred. This has been logged and we&apos;ll look into it.
        </p>

        <button
          onClick={reset}
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-[#0A0A0F] bg-[#C8A84B] rounded-lg hover:bg-[#D4B85C] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C8A84B]/50"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
