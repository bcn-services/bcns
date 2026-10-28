/** NumbersCharts — the two inline-SVG charts the Numbers tiles use (no chart library). Server-safe. */

/** A sparkline: one series, the last point dotted; hover = a native <title> per point. */
export function Spark({
  vals,
  labels,
  fmt,
  w = 96,
  h = 30,
}: {
  vals: number[];
  labels: string[];
  fmt: (v: number) => string;
  w?: number;
  h?: number;
}) {
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const sx = w / Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i): [number, number] => [
    i * sx,
    h - 3 - ((v - min) / (max - min || 1)) * (h - 6),
  ]);
  return (
    <svg className="nc" width={w} height={h} viewBox={`-3 0 ${w + 6} ${h}`} aria-hidden="true">
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === pts.length - 1 ? 3.5 : 6}
          fill={i === pts.length - 1 ? "var(--accent)" : "transparent"}
        >
          <title>{`${labels[i] ?? ""} ${fmt(vals[i] ?? 0)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** A column chart with an optional dashed goal line; the last column is the accent one. */
export function Cols({
  vals,
  labels,
  fmt,
  goal,
  w = 760,
  h = 240,
  name,
}: {
  vals: number[];
  labels: string[];
  fmt: (v: number) => string;
  goal?: number;
  w?: number;
  h?: number;
  name: string;
}) {
  const hi = vals.length - 1;
  const max = Math.max(...vals, goal ?? 0) * 1.1 || 1;
  const bw = w / Math.max(vals.length, 1);
  const y = (v: number) => h - 22 - (v / max) * (h - 34);
  return (
    <svg
      className="nc"
      width="100%"
      viewBox={`0 0 ${w + (goal ? 80 : 0)} ${h}`}
      role="img"
      aria-label={name}
    >
      <line x1="0" x2={w} y1={h - 22} y2={h - 22} stroke="var(--line)" />
      {vals.map((v, i) => (
        <g key={i}>
          <rect
            x={i * bw + 3}
            y={y(v)}
            width={bw - 6}
            height={Math.max(h - 22 - y(v), 1)}
            rx="4"
            fill={i === hi ? "var(--accent)" : "#b9c8f7"}
          >
            <title>{`${labels[i] ?? ""}: ${fmt(v)}`}</title>
          </rect>
          {i === hi ? (
            <text x={i * bw + bw / 2} y={y(v) - 5} textAnchor="middle" className="hi">
              {fmt(v)}
            </text>
          ) : null}
          {labels[i] && (i % Math.ceil(vals.length / 8) === 0 || i === hi) ? (
            <text x={i * bw + bw / 2} y={h - 6} textAnchor="middle">
              {labels[i]}
            </text>
          ) : null}
        </g>
      ))}
      {goal ? (
        <>
          <line
            x1="0"
            x2={w}
            y1={y(goal)}
            y2={y(goal)}
            stroke="var(--ink2)"
            strokeDasharray="4 4"
          />
          <text x={w + 4} y={y(goal) + 4}>{`goal ${fmt(goal)}`}</text>
        </>
      ) : null}
    </svg>
  );
}
