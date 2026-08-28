/**
 * The bcns mark: three isometric cubes. Geometry + face shading live here so
 * the SVG logo (header/footer) and the CSS-3D hero stack share one palette.
 * Raw HSL on purpose — this is the literal brand blue, not a theme token.
 */

// Logo blue #7EB3F7 ≈ hsl(214 88% 73%), shaded per face: [top, left, right].
export const FACE_FILLS = [
  "hsl(214 92% 82%)",
  "hsl(214 88% 73%)",
  "hsl(214 62% 56%)",
] as const;

/** Isometric cube outline paths. Center (cx, cy), half-width w. */
export function cubePaths(cx: number, cy: number, w: number) {
  const h = w * 0.577;
  const T = `${cx},${cy - 2 * h}`;
  const L = `${cx - w},${cy - h}`;
  const R = `${cx + w},${cy - h}`;
  const C = `${cx},${cy}`;
  const BL = `${cx - w},${cy + h}`;
  const BR = `${cx + w},${cy + h}`;
  const B = `${cx},${cy + 2 * h}`;
  return [
    `M ${T} L ${L} L ${C} L ${R} Z`, // top face
    `M ${L} L ${BL} L ${B} L ${C} Z`, // left face
    `M ${R} L ${BR} L ${B} L ${C} Z`, // right face
  ];
}

const MARK_CUBES: Array<[number, number]> = [
  [110, 56],
  [74, 119],
  [146, 119],
];

/** Static three-cube logo mark. Server-safe — no motion, no client boundary. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 180" className={className} aria-hidden focusable="false">
      {MARK_CUBES.map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          {cubePaths(cx, cy, 36).map((d, j) => (
            <path
              key={j}
              d={d}
              fill={FACE_FILLS[j]}
              stroke="hsl(var(--foreground))"
              strokeWidth={6}
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
