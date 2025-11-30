import React from 'react';

function LineChart({ data, width = 400, height = 200, color = '#4e81ee' }) {
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

  // Find min/max values
  const values = data.map(d => d.value || d.avgScore || 0);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 100);

  const valueRange = maxValue - minValue || 100;

  // Calculate points
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
    const value = d.value || d.avgScore || 0;
    const y = padding + chartHeight - ((value - minValue) / valueRange) * chartHeight;
    return { x, y, value, label: d.label || d.week || d.month || `Point ${i + 1}` };
  });

  // Create path for line
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="line-chart-container">
      <svg width={width} height={height} className="line-chart">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(val => {
          const y = padding + chartHeight - ((val - minValue) / valueRange) * chartHeight;
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

        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Area under line */}
        <path
          d={`${pathData} L ${points[points.length - 1].x} ${padding + chartHeight} L ${points[0].x} ${padding + chartHeight} Z`}
          fill={color}
          fillOpacity="0.1"
        />

        {/* Data points */}
        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
            />
            <title>{point.label}: {point.value}%</title>
          </g>
        ))}

        {/* X-axis labels */}
        {points.map((point, i) => {
          if (i % Math.ceil(points.length / 5) === 0 || i === points.length - 1) {
            return (
              <text
                key={i}
                x={point.x}
                y={height - padding + 20}
                fontSize="10"
                fill="#6b7280"
                textAnchor="middle"
              >
                {point.label.length > 8 ? point.label.substring(0, 8) + '...' : point.label}
              </text>
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}

export default LineChart;

