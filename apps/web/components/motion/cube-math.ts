/**
 * Pure geometry for LogoCube, ported from the prototype's buildCube layout().
 * No DOM access: callers measure, this returns numbers (all px except `gs`).
 */

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));

/**
 * The three blocks in logo order. `px/py` are the seat inside the resting
 * cluster (fractions of the cluster box), `tx/ty` the unit direction the block
 * breaks away along, `pillar` the card/column it lands on (0 left, 1 right, 2 top).
 */
export const CUBE_SLOTS = [
  { px: 0.5, py: 0.285714, tx: 0, ty: -1, pillar: 2 }, // top
  { px: 0.25, py: 0.714286, tx: -0.866, ty: 0.5, pillar: 0 }, // bottom-left
  { px: 0.75, py: 0.714286, tx: 0.866, ty: 0.5, pillar: 1 }, // bottom-right
] as const;

export interface CubeLayoutInput {
  W: number;
  H: number;
  /** viewport >= 900px */
  wide: boolean;
  withCards: boolean;
  /** wide + cards only: x centre of each pillar's card (index = pillar), relative to the box */
  cardCenters?: readonly number[];
}

export interface CubePlacement {
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  gx: number;
  gy: number;
  gs: number;
  shadow: { left: number; top: number; width: number };
}

export interface CubeLayout {
  E: number;
  bw: number;
  Wc: number;
  Hc: number;
  /** phone + cards: height of the cube zone closed / open */
  zc: number;
  zo: number;
  cubes: CubePlacement[];
}

/** Resting cluster size: width Wc (px) and the top offset, as the prototype seats it. */
export function restGeometry(W: number, H: number, wide: boolean, withCards: boolean) {
  const Wc = withCards
    ? wide ? Math.min(W * 0.46, 470) : Math.min(W * 0.62, 240)
    : wide ? Math.min(W * 0.4, 330) : Math.min(W * 0.62, 230);
  const Hc = (Wc * 259) / 256;
  const phone = withCards && !wide;
  const top = phone ? 8 : Math.max(8, (H - (wide ? 60 : 56) - Hc) / 2);
  return { Wc, Hc, top, cx: W / 2 };
}

export function cubeLayout({ W, H, wide, withCards, cardCenters }: CubeLayoutInput): CubeLayout | null {
  if (!W || !H) return null;
  const { Wc, Hc, top, cx } = restGeometry(W, H, wide, withCards);
  const k = Wc / 128;
  const E = 45.3157 * k;
  const bw = (1.4 / 0.816497) * k;
  const Eo = withCards
    ? wide ? 170 : Math.min(120, (W / 3) * 0.8)
    : Math.min(wide ? 150 : 100, (W / 3) * 0.74);
  const gs = Eo / E;
  const T = 0.07 * Wc;
  const cubes = CUBE_SLOTS.map((c): CubePlacement => {
    const x0 = cx + (c.px - 0.5) * Wc;
    const y0 = top + c.py * Hc;
    const tx = c.tx * T;
    const ty = c.ty * T;
    let X: number;
    let Y: number;
    if (withCards) {
      if (wide) { X = cardCenters?.[c.pillar] ?? (W * (c.pillar + 0.5)) / 3; Y = 124; }
      else { X = (W * (c.pillar + 0.5)) / 3; Y = 16 + Eo / 2; }
    } else { X = (W * (c.pillar + 0.5)) / 3; Y = (H - 40) / 2; }
    const width = Eo * 0.92;
    return {
      x0, y0, tx, ty, gx: X - x0 - tx, gy: Y - y0 - ty, gs,
      shadow: { left: X - width / 2, top: Y + Eo / 2 + (wide ? 14 : 8), width },
    };
  });
  return { E, bw, Wc, Hc, zc: top + Hc + 48, zo: Eo + 56, cubes };
}

export interface DotSpec { row: number; col: number; x: number; y: number; delay: number }

/** rows x cols dot grid on one face; x/y are percentages of the face, delay in seconds (face = 0|1|2). */
export function dotGrid(rows: number, cols: number, face: number): DotSpec[] {
  const out: DotSpec[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++)
      out.push({
        row, col,
        x: 14 + col * 24,
        y: 12 + row * 19,
        delay: +(0.35 + (face * rows + row) * 0.07 + col * 0.03).toFixed(2),
      });
  return out;
}
