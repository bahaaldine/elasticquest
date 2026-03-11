'use client';

interface RadarChartProps {
  data: { label: string; value: number }[]; // value is 0-100
  size?: number;
}

export function RadarChart({ data, size = 300 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const levels = 5;
  const n = data.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // Start from top

  const getPoint = (i: number, r: number): [number, number] => {
    const angle = startAngle + i * angleStep;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  // Grid lines
  const gridPaths: string[] = [];
  for (let level = 1; level <= levels; level++) {
    const r = (radius / levels) * level;
    const points = Array.from({ length: n }, (_, i) => getPoint(i, r));
    gridPaths.push(points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z');
  }

  // Axis lines
  const axes = Array.from({ length: n }, (_, i) => ({
    x1: cx,
    y1: cy,
    x2: getPoint(i, radius)[0],
    y2: getPoint(i, radius)[1],
  }));

  // Data polygon
  const dataPoints = data.map((d, i) => getPoint(i, (d.value / 100) * radius));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';

  // Labels
  const labels = data.map((d, i) => {
    const labelRadius = radius + 24;
    const [x, y] = getPoint(i, labelRadius);
    return { ...d, x, y };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridPaths.map((path, i) => (
        <path
          key={`grid-${i}`}
          d={path}
          fill="none"
          stroke="#262626"
          strokeWidth={i === levels - 1 ? 1.5 : 0.5}
        />
      ))}

      {/* Axes */}
      {axes.map((axis, i) => (
        <line
          key={`axis-${i}`}
          x1={axis.x1}
          y1={axis.y1}
          x2={axis.x2}
          y2={axis.y2}
          stroke="#262626"
          strokeWidth={0.5}
        />
      ))}

      {/* Data fill */}
      <path d={dataPath} fill="rgba(0, 191, 174, 0.15)" stroke="#00bfae" strokeWidth={2} />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={`point-${i}`} cx={p[0]} cy={p[1]} r={4} fill="#00bfae" />
      ))}

      {/* Labels */}
      {labels.map((l, i) => (
        <text
          key={`label-${i}`}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#a3a3a3"
          fontSize={11}
          fontFamily="-apple-system, sans-serif"
        >
          <tspan>{l.label}</tspan>
          <tspan x={l.x} dy={14} fill="#e5e5e5" fontWeight={600} fontSize={12}>
            {l.value}%
          </tspan>
        </text>
      ))}

      {/* Level labels (percentages on first axis) */}
      {[20, 40, 60, 80, 100].map((pct, i) => {
        const [x, y] = getPoint(0, (pct / 100) * radius);
        return (
          <text
            key={`level-${i}`}
            x={x + 8}
            y={y - 4}
            fill="#525252"
            fontSize={9}
            fontFamily="monospace"
          >
            {pct}
          </text>
        );
      })}
    </svg>
  );
}
