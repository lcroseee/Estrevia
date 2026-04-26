'use client';

/**
 * SpendChart — simple SVG bar chart for 7-day spend history.
 *
 * Pure client component so we can use window sizing hooks.
 * Gracefully degrades if no data.
 */

import type { AdvertisingSpendDaily } from '@/shared/lib/schema';

interface SpendChartProps {
  data: AdvertisingSpendDaily[];
}

const CHART_HEIGHT = 80;
const BAR_GAP = 4;

export function SpendChart({ data }: SpendChartProps) {
  if (!data.length) {
    return <p className="text-sm text-white/30 py-4">No spend history yet.</p>;
  }

  const maxSpend = Math.max(...data.map((d) => d.spentUsd), 1);

  return (
    <div aria-label="7-day spend bar chart" role="img">
      <svg
        width="100%"
        viewBox={`0 0 ${data.length * (40 + BAR_GAP)} ${CHART_HEIGHT + 24}`}
        preserveAspectRatio="none"
        className="overflow-visible"
        aria-hidden="true"
      >
        {data.map((day, i) => {
          const barHeight = Math.max(2, (day.spentUsd / maxSpend) * CHART_HEIGHT);
          const x = i * (40 + BAR_GAP);
          const y = CHART_HEIGHT - barHeight;
          const isHalted = day.triggeredHalt;
          const usage = day.capUsd > 0 ? day.spentUsd / day.capUsd : 0;

          const fill = isHalted
            ? '#ef4444'
            : usage > 0.8
              ? '#f59e0b'
              : '#6366f1';

          return (
            <g key={day.date}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={40}
                height={barHeight}
                rx={3}
                fill={fill}
                opacity={0.8}
                aria-label={`${day.date}: $${day.spentUsd.toFixed(2)}`}
              />
              {/* Amount label above bar */}
              {barHeight > 16 && (
                <text
                  x={x + 20}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(255,255,255,0.5)"
                >
                  ${day.spentUsd.toFixed(0)}
                </text>
              )}
              {/* Date label below */}
              <text
                x={x + 20}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(255,255,255,0.3)"
              >
                {day.date.slice(5)} {/* MM-DD */}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Accessible table fallback */}
      <table className="sr-only">
        <caption>7-day spend history</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Spent (USD)</th>
            <th>Cap (USD)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>${day.spentUsd.toFixed(2)}</td>
              <td>${day.capUsd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
