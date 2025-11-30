import React from 'react';

function BarChart({ data, width = 400, height = 200, color = '#4e81ee' }) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <p>No data available</p>
      </div>
    );
  }

  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.length - 10;

  // Find max value
  const values = data.map(d => d.value || d.count || 0);
  const maxValue = Math.max(...values, 1);

  return (
    <div className="bar-chart-container">
      <svg width={width} height={height} className="bar-chart">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(val => {
          const y = padding + chartHeight - (val / 100) * chartHeight;
          return (
            <g key={val}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#e6e7e8"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              <text
                x={padding - 10}
                y={y + 4}
                fontSize="10"
                fill="#6b7280"
                textAnchor="end"
              >
                {val}%
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((item, i) => {
          const value = item.value || item.count || item.percentage || 0;
          const barHeight = (value / maxValue) * chartHeight;
          const x = padding + i * (chartWidth / data.length) + 5;
          const y = padding + chartHeight - barHeight;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={color}
                rx="4"
                opacity="0.8"
              />
              <text
                x={x + barWidth / 2}
                y={y - 5}
                fontSize="10"
                fill="#030712"
                textAnchor="middle"
                fontWeight="600"
              >
                {Math.round(value)}%
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
              <title>{item.label || item.phase}: {Math.round(value)}%</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default BarChart;

