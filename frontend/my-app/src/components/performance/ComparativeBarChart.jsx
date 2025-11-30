import React from 'react';

/**
 * ComparativeBarChart component for comparing user vs platform data
 * @param {Array} data - Array of {label, user, platform} objects
 * @param {number} width - Chart width
 * @param {number} height - Chart height
 * @param {string} userColor - Color for user bars
 * @param {string} platformColor - Color for platform bars
 */
function ComparativeBarChart({ 
  data = [], 
  width = 800, 
  height = 400,
  userColor = '#4e81ee',
  platformColor = '#94a3b8'
}) {
  if (!data || data.length === 0) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>No data available</p>
      </div>
    );
  }

  const padding = { top: 40, right: 40, bottom: 60, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Calculate spacing: each category gets space for 2 bars + gap between categories
  const categorySpacing = chartWidth / data.length;
  const barWidth = categorySpacing * 0.35; // Each bar takes 35% of category space
  const gapBetweenBars = categorySpacing * 0.1; // 10% gap between paired bars
  const categoryGap = categorySpacing * 0.2; // 20% gap between categories

  // Find max value for scaling
  const maxValue = Math.max(
    ...data.map(d => Math.max(d.user || 0, d.platform || 0)),
    100
  );

  const scale = chartHeight / maxValue;

  return (
    <div style={{ width, height, position: 'relative' }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        {/* Y-axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="#e5e7eb"
          strokeWidth="2"
        />

        {/* Y-axis labels */}
        {[0, 25, 50, 75, 100].map((value, index) => {
          if (value > maxValue) return null;
          const y = height - padding.bottom - (value * scale);
          return (
            <g key={index}>
              <line
                x1={padding.left - 5}
                y1={y}
                x2={padding.left}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#6b7280"
                fontSize="11"
              >
                {value}%
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((item, index) => {
          // Calculate center position for this category
          const categoryCenter = padding.left + (index + 0.5) * categorySpacing;
          
          // Position bars side-by-side, centered in category space
          const platformX = categoryCenter - barWidth - gapBetweenBars / 2;
          const userX = categoryCenter + gapBetweenBars / 2;
          
          const userHeight = (item.user || 0) * scale;
          const platformHeight = (item.platform || 0) * scale;
          const baseY = height - padding.bottom;

          return (
            <g key={index}>
              {/* Platform bar (left) */}
              <rect
                x={platformX}
                y={baseY - platformHeight}
                width={barWidth}
                height={platformHeight}
                fill={platformColor}
                opacity={0.6}
                rx="4"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  e.target.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.target.style.opacity = '0.6';
                }}
              />
              
              {/* User bar (right) */}
              <rect
                x={userX}
                y={baseY - userHeight}
                width={barWidth}
                height={userHeight}
                fill={userColor}
                rx="4"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  e.target.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.target.style.opacity = '1';
                }}
              />
              
              {/* Value labels on bars */}
              {userHeight > 20 && (
                <text
                  x={userX + barWidth / 2}
                  y={baseY - userHeight - 5}
                  textAnchor="middle"
                  fill="#030712"
                  fontSize="11"
                  fontWeight="600"
                >
                  {Math.round(item.user)}%
                </text>
              )}
              {platformHeight > 20 && (
                <text
                  x={platformX + barWidth / 2}
                  y={baseY - platformHeight - 5}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="11"
                  fontWeight="600"
                >
                  {Math.round(item.platform)}%
                </text>
              )}

              {/* X-axis label - centered below the paired bars */}
              <text
                x={categoryCenter}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                fill="#6b7280"
                fontSize="12"
                fontWeight="500"
              >
                {item.label}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${width - padding.right - 150}, ${padding.top})`}>
          <rect x={0} y={0} width={12} height={12} fill={userColor} rx="2" />
          <text x={18} y={10} fill="#030712" fontSize="12" fontWeight="500">You</text>
          
          <rect x={0} y={20} width={12} height={12} fill={platformColor} opacity={0.6} rx="2" />
          <text x={18} y={30} fill="#6b7280" fontSize="12" fontWeight="500">Platform Avg</text>
        </g>
      </svg>
    </div>
  );
}

export default ComparativeBarChart;

