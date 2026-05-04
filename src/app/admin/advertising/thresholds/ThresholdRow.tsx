'use client';

/**
 * ThresholdRow — single row in the thresholds table. Shows the effective
 * value (DB row if present, else code default) with the source badge and
 * supports inline edit. Saving creates a new `advertising_thresholds` row
 * via `saveThresholdAction` (founder_override).
 */

import { useState, useTransition } from 'react';
import { saveThresholdAction } from './actions';

interface EffectiveRow {
  value: number;
  source: string;
  effectiveFrom: Date | string;
}

interface ThresholdRowProps {
  metric: string;
  effectiveRow: EffectiveRow | null;
  codeDefault: number;
}

const SOURCE_COLOR: Record<string, string> = {
  founder_override: 'text-amber-400',
  auto_calibrated: 'text-blue-400',
  default: 'text-neutral-500',
};

export function ThresholdRow({ metric, effectiveRow, codeDefault }: ThresholdRowProps) {
  const initialValue = effectiveRow?.value ?? codeDefault;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveThresholdAction({
        scope: 'global',
        scope_id: null,
        metric_name: metric,
        value,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  };

  const onCancel = () => {
    setValue(initialValue);
    setError(null);
    setEditing(false);
  };

  const sourceLabel = effectiveRow?.source ?? 'default (code)';
  const sourceColor = SOURCE_COLOR[effectiveRow?.source ?? 'default'] ?? 'text-neutral-500';
  const displayValue = (effectiveRow?.value ?? codeDefault).toFixed(2);

  return (
    <tr className="border-t border-white/8">
      <td className="py-2 pr-3 font-mono text-xs text-white/80">{metric}</td>
      <td className="pr-3 text-sm">
        {editing ? (
          <input
            type="number"
            step="0.01"
            value={Number.isFinite(value) ? value : 0}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-24 rounded bg-white/6 border border-white/15 px-2 py-1 text-white focus:outline-none focus:border-white/30"
            aria-label={`New value for ${metric}`}
            disabled={pending}
          />
        ) : (
          <span className="text-white">{displayValue}</span>
        )}
      </td>
      <td className="pr-3">
        <span className={`text-xs ${sourceColor}`}>{sourceLabel}</span>
      </td>
      <td className="pr-3 text-xs text-white/40">{codeDefault.toFixed(2)}</td>
      <td className="text-sm">
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="text-white/40 hover:text-white/70 disabled:opacity-50"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-red-400 ml-2">{error}</span>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-white/60 hover:text-white"
            aria-label={`Edit ${metric}`}
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
