'use client';

import { useState } from 'react';

interface BatchResult {
  uploaded?: number;
  failed?: number;
  skipped?: number;
  previewed?: number;
}

export function PublishAllButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function go(dryRun: boolean) {
    setBusy(true);
    setResult(null);
    try {
      const url = `/api/admin/creatives/publish-batch${dryRun ? '?dry_run=1' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      const json: BatchResult = await res.json();
      setResult(
        `uploaded=${json.uploaded ?? 0} failed=${json.failed ?? 0} skipped=${json.skipped ?? 0} previewed=${json.previewed ?? 0}`,
      );
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => go(true)}
        disabled={busy}
        className="text-sm rounded px-3 py-1 border border-white/10 text-white/80 hover:bg-white/5 disabled:opacity-50"
      >
        Dry-run
      </button>
      <button
        onClick={() => go(false)}
        disabled={busy}
        className="text-sm rounded px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? 'Publishing…' : 'Publish all approved'}
      </button>
      {result && (
        <span className="text-xs text-white/60">{result}</span>
      )}
    </div>
  );
}
