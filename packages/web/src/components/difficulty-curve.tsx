'use client';

interface DiffCurveProps {
  data: { difficulty: string; percentage: number; count: number }[];
  width?: number;
  height?: number;
}

const DIFF_ORDER = ['beginner', 'intermediate', 'advanced', 'expert'];
const DIFF_COLORS: Record<string, string> = {
  beginner: '#22c55e',
  intermediate: '#3b82f6',
  advanced: '#a855f7',
  expert: '#ef4444',
};

export function DifficultyCurve({ data, width = 500, height = 200 }: DiffCurveProps) {
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Sort by difficulty order
  const sorted = DIFF_ORDER
    .map((d) => data.find((item) => item.difficulty === d))
    .filter(Boolean) as typeof data;

  if (sorted.length === 0) return null;

  const n = sorted.length;
  const stepX = chartW / (n - 1 || 1);

  const points = sorted.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartH - (d.percentage / 100) * chartH,
    ...d,
  }));

  // Line path
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ');

  // Area fill path
  const areaPath = linePath +
    ` L${points[points.length - 1].x},${padding.top + chartH}` +
    ` L${points[0].x},${padding.top + chartH} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y-axis grid lines */}
      {[0, 25, 50, 75, 100].map((pct) => {
        const y = padding.top + chartH - (pct / 100) * chartH;
        return (
          <g key={pct}>
            <line
              x1={padding.left}
              y1={y}
              x2={padding.left + chartW}
              y2={y}
              stroke="#262626"
              strokeWidth={0.5}
              strokeDasharray={pct === 0 ? undefined : '4,4'}
            />
            <text
              x={padding.left - 8}
              y={y + 3}
              textAnchor="end"
              fill="#525252"
              fontSize={10}
              fontFamily="monospace"
            >
              {pct}%
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="rgba(0, 191, 174, 0.08)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#00bfae" strokeWidth={2.5} strokeLinejoin="round" />

      {/* Points and labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={6} fill={DIFF_COLORS[p.difficulty] ?? '#00bfae'} />
          <circle cx={p.x} cy={p.y} r={3} fill="#0a0a0a" />

          {/* Percentage label above point */}
          <text
            x={p.x}
            y={p.y - 14}
            textAnchor="middle"
            fill="#e5e5e5"
            fontSize={12}
            fontWeight={600}
            fontFamily="monospace"
          >
            {p.percentage}%
          </text>

          {/* Difficulty label below axis */}
          <text
            x={p.x}
            y={padding.top + chartH + 18}
            textAnchor="middle"
            fill={DIFF_COLORS[p.difficulty] ?? '#737373'}
            fontSize={11}
            fontWeight={600}
          >
            {p.difficulty}
          </text>

          {/* Count label */}
          <text
            x={p.x}
            y={padding.top + chartH + 32}
            textAnchor="middle"
            fill="#525252"
            fontSize={9}
          >
            ({p.count})
          </text>
        </g>
      ))}
    </svg>
  );
}
