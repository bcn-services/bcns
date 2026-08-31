/**
 * The bcns mark and the single isometric cube it is built from.
 *
 * The geometry and the three face colours are FROZEN — they are the logo. Every
 * other cube on the site (hero stack, service-card corners, list bullets,
 * background texture) is this same cube at a different size, so the motif reads
 * as one shape recurring rather than as a family of similar shapes.
 *
 * Raw hex on purpose: these are literal brand colours, not theme tokens. They do
 * not change between light and dark. Only the stroke follows the theme, so the
 * near-black outline of the light artboards stays legible on a near-black ground.
 */

/** Face fills in draw order: top, left, right. */
export const FACE_FILLS = ["#C7DDFA", "#7EB3F7", "#4A86D7"] as const;

/** viewBox that frames exactly one cube of the mark. */
export const CUBE_VIEW_BOX = "44 45 68 78";

/** The three filled faces of one cube, in `CUBE_VIEW_BOX` coordinates. */
export const CUBE_FACES = [
  "M78 47 L110 65.5 L78 84 L46 65.5 Z",
  "M46 65.5 L78 84 L78 121 L46 102.5 Z",
  "M78 84 L110 65.5 L110 102.5 L78 121 Z",
] as const;

/** The cube's visible edges as one continuous path. */
export const CUBE_OUTLINE =
  "M78 47 L110 65.5 L78 84 L46 65.5 Z M46 65.5 L46 102.5 L78 121 L78 84 M78 121 L110 102.5 L110 65.5";

/**
 * One filled cube. Used at every scale from a 12px list bullet up.
 * `strokeWidth` is in viewBox units, so it thins visually as the cube grows.
 */
export function Cube({
  className,
  strokeWidth = 1.4,
  filled = true,
}: {
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
}) {
  return (
    <svg viewBox={CUBE_VIEW_BOX} className={className} aria-hidden focusable="false">
      {filled &&
        CUBE_FACES.map((d, i) => <path key={i} d={d} fill={FACE_FILLS[i]} />)}
      <path
        d={CUBE_OUTLINE}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The three-cube mark: two seated side by side, one resting in line on top.
 * Server-safe — no motion, no client boundary.
 */
export function LogoMark({ className }: { className?: string }) {
  // Each cube is the base geometry translated: right cube +64x, top cube
  // +32x/-55.5y. Those two offsets are what makes the cluster one solid object —
  // the right cube shares the left cube's vertical edge, and the top cube's
  // bottom vertex lands exactly where the two front cubes meet, so its two lower
  // edges lie flush along their top faces with no overhang. Written out rather
  // than transformed so the paths stay literal.
  const cubes: Array<readonly [string, string, string]> = [
    // Top cube first so the two front cubes paint over the shared seams.
    [
      "M110 -8.5 L142 10 L110 28.5 L78 10 Z",
      "M78 10 L110 28.5 L110 65.5 L78 47 Z",
      "M110 28.5 L142 10 L142 47 L110 65.5 Z",
    ],
    [
      "M78 47 L110 65.5 L78 84 L46 65.5 Z",
      "M46 65.5 L78 84 L78 121 L46 102.5 Z",
      "M78 84 L110 65.5 L110 102.5 L78 121 Z",
    ],
    [
      "M142 47 L174 65.5 L142 84 L110 65.5 Z",
      "M110 65.5 L142 84 L142 121 L110 102.5 Z",
      "M142 84 L174 65.5 L174 102.5 L142 121 Z",
    ],
  ];

  return (
    <svg viewBox="44 -10.5 132 133.5" className={className} aria-hidden focusable="false">
      <g stroke="hsl(var(--foreground))" strokeWidth={2.5} strokeLinejoin="round">
        {cubes.map((faces, i) => (
          <g key={i}>
            {faces.map((d, j) => (
              <path key={j} d={d} fill={FACE_FILLS[j]} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
