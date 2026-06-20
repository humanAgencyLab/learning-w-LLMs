import React from 'react';

/**
 * @param {object} props
 * @param {Array<{ label?: string, phase?: string, value?: number, count?: number, percentage?: number }>} props.data
 * @param {'percentage'|'count'} [props.mode]
 */
function BarChart({ data, width = 400, height = 200, color = '#4e81ee', mode = 'percentage' }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-lg">
        No data available
      </div>
    );
  }

  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.length - 10;

  const values = data.map((d) => d.value ?? d.count ?? d.percentage ?? 0);
  const maxValue = Math.max(...values, 1);

  const isCount = mode === 'count';
  const yTicks = isCount
    ? [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxValue)))]
    : [0, 25, 50, 75, 100];

  const formatYTick = (v) => (isCount ? String(v) : `${v}%`);

  const formatBarLabel = (v) => (isCount ? String(Math.round(v)) : `${Math.round(v)}%`);

  return (
    <div className="bar-chart-container">
      <svg width={width} height={height} className="bar-chart">
        {yTicks.map((val, ti) => {
          const y = padding + chartHeight - (isCount ? (val / maxValue) * chartHeight : (val / 100) * chartHeight);
          return (
            <g key={`${ti}-${val}`}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              <text x={padding - 10} y={y + 4} fontSize="10" fill="#6b7280" textAnchor="end">
                {formatYTick(val)}
              </text>
            </g>
          );
        })}

        {data.map((item, i) => {
          const value = item.value ?? item.count ?? item.percentage ?? 0;
          const denom = isCount ? maxValue : 100;
          const barHeight = (value / denom) * chartHeight;
          const x = padding + i * (chartWidth / data.length) + 5;
          const y = padding + chartHeight - barHeight;

          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx="4" opacity="0.85" />
              <text
                x={x + barWidth / 2}
                y={y - 5}
                fontSize="10"
                fill="#111827"
                textAnchor="middle"
                fontWeight="600"
              >
                {formatBarLabel(value)}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - padding + 15}
                fontSize="10"
                fill="#6b7280"
                textAnchor="middle"
              >
                {item.label || item.phase || `Item ${i + 1}`}
              </text>
              <title>
                {item.label || item.phase}: {formatBarLabel(value)}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default BarChart;
