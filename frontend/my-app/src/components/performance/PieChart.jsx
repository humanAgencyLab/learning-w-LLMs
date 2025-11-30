import React from 'react';

/**
 * PieChart component for displaying data in a pie chart format
 * @param {Array} data - Array of {label, value} objects
 * @param {number} width - Chart width
 * @param {number} height - Chart height
 * @param {Array} colors - Optional color array
 */
function PieChart({ data = [], width = 400, height = 400, colors = null }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>No data available</p>
      </div>
    );
  }

  const defaultColors = [
    '#4e81ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
    '#ec4899', '#84cc16', '#f97316', '#6366f1'
  ];
  const chartColors = colors || defaultColors;

  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  if (total === 0) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>No data available</p>
      </div>
    );
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 20;

  let currentAngle = -Math.PI / 2; // Start at top
  const slices = [];

  data.forEach((item, index) => {
    const value = item.value || 0;
    const percentage = (value / total) * 100;
    const angle = (value / total) * 2 * Math.PI;

    if (angle > 0) {
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      
      // Calculate path for slice
      const x1 = centerX + radius * Math.cos(startAngle);
      const y1 = centerY + radius * Math.sin(startAngle);
      const x2 = centerX + radius * Math.cos(endAngle);
      const y2 = centerY + radius * Math.sin(endAngle);
      
      const largeArcFlag = angle > Math.PI ? 1 : 0;
      
      const pathData = [
        `M ${centerX} ${centerY}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z'
      ].join(' ');

      slices.push({
        pathData,
        color: chartColors[index % chartColors.length],
        label: item.label,
        value: value,
        percentage: percentage.toFixed(1),
        midAngle: startAngle + angle / 2,
        index
      });

      currentAngle = endAngle;
    }
  });

  // Calculate label positions
  const labelRadius = radius * 0.7;
  const labels = slices.map(slice => {
    const labelX = centerX + labelRadius * Math.cos(slice.midAngle);
    const labelY = centerY + labelRadius * Math.sin(slice.midAngle);
    return { ...slice, labelX, labelY };
  });

  return (
    <div style={{ width, height, position: 'relative' }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        {/* Render slices */}
        {slices.map((slice, index) => (
          <g key={index}>
            <path
              d={slice.pathData}
              fill={slice.color}
              stroke="#fff"
              strokeWidth="2"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                e.target.style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                e.target.style.opacity = '1';
              }}
            />
            {/* Label text */}
            {slice.percentage > 5 && (
              <text
                x={labels[index].labelX}
                y={labels[index].labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="12"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {slice.percentage}%
              </text>
            )}
          </g>
        ))}
      </svg>
      
      {/* Legend */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '200px'
      }}>
        {slices.map((slice, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              backgroundColor: slice.color,
              borderRadius: '2px'
            }}></div>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {slice.label}: {slice.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PieChart;

