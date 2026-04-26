'use client';

/**
 * BulkApproveButton — client component that fires sequential approve calls
 * for the top-N creatives by brand score.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface BulkApproveButtonProps {
  ids: string[];
  label: string;
}

export function BulkApproveButton({ ids, label }: BulkApproveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleBulkApprove() {
    setLoading(true);
    setError(null);
    setDone(0);
    let succeeded = 0;

    for (const id of ids) {
      try {
        const res = await fetch(`/api/admin/creatives/${id}/approve`, { method: 'POST' });
        if (res.ok) succeeded++;
      } catch {
        // continue with remaining ids even on individual failure
      }
      setDone(succeeded);
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleBulkApprove}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={label}
      >
        {loading ? `Approving ${done}/${ids.length}…` : label}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
