'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'uploaded', label: 'Uploaded (paused in Meta)' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

export function StatusFilter({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(sp);
        next.set('status', e.target.value);
        router.push(`?${next.toString()}`);
      }}
      className="bg-black/40 border border-white/10 text-white text-sm rounded px-2 py-1"
      aria-label="Filter by status"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
