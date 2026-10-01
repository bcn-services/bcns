/** Pure layout for the Connect stage diagram (ported from the prototype's geo()). All units are px in the panel's own box. */

export type Pt = readonly [number, number];
export type Scr = readonly [number, number, number]; // x, y, rotation deg

export interface ConnectGeo {
  w: number;
  h: number;
  /** wide layout: tools left, cube centre, outputs right. Otherwise stacked. */
  land: boolean;
  cw: number; ch: number;
  tool: Pt[]; scr: Scr[]; row: Pt[]; dest: Pt[];
  cs: number; cx: number; cy: number;
  rw: number; rx: number; rh: number;
  dw: number; dh: number;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function connectGeo(w: number, h: number): ConnectGeo {
  const land = w >= 560 && w >= h * 1.15;
  const tool: Pt[] = [];
  const row: Pt[] = [];
  const dest: Pt[] = [];
  if (land) {
    const pad = Math.max(20, w * 0.04);
    const cw = clamp(w * 0.15, 124, 184);
    const ch = clamp(h * 0.082, 38, 56);
    const gap = ch * 0.5;
    const y0 = (h - (5 * ch + 4 * gap)) / 2;
    for (let i = 0; i < 5; i++) tool.push([pad, y0 + i * (ch + gap)]);
    const cs = clamp(h * 0.3, 96, 200);
    const rw = clamp(w * 0.27, 190, 340);
    const rx = w - pad - rw;
    const rh = clamp(h * 0.095, 34, 54);
    const ry0 = (h - 5 * rh) / 2;
    for (let i = 0; i < 5; i++) row.push([rx, ry0 + i * rh + rh / 2]);
    const dh = clamp(h * 0.19, 70, 120);
    const dg = dh * 0.22;
    const d0 = (h - (3 * dh + 2 * dg)) / 2;
    for (let i = 0; i < 3; i++) dest.push([rx, d0 + i * (dh + dg)]);
    const zw = w / 2 - cs / 2 - 30 - pad - cw; // scramble zone sits left of the cube
    const scr = ([[0, 0.06, -9], [0.34, 0.3, 7], [0.05, 0.52, -5], [0.4, 0.7, 6], [0.1, 0.84, -8]] as const).map(
      (s): Scr => [pad + 10 + s[0] * (zw * 0.9), h * 0.16 + s[1] * (h * 0.68 - ch), s[2]],
    );
    return { w, h, land, cw, ch, tool, scr, row, dest, cs, cx: w / 2, cy: h / 2, rw, rx, rh, dw: rw, dh };
  }
  const p = 14;
  const cw = Math.min((w - 2 * p - 10) / 2, 150);
  const ch = 34;
  tool.push([p, 12], [w - p - cw, 12], [p, 12 + ch + 8], [w - p - cw, 12 + ch + 8], [(w - cw) / 2, 12 + 2 * (ch + 8)]);
  const cs = clamp(w * 0.26, 84, 100);
  const cy = 12 + 3 * ch + 16 + 22 + cs / 2;
  const rw = w - 2 * p;
  const rh = 28;
  const rtop = cy + cs / 2 + 22;
  for (let i = 0; i < 5; i++) row.push([p, rtop + i * rh + rh / 2]);
  const dw = (w - 2 * p - 16) / 3;
  const dh = 66;
  for (let i = 0; i < 3; i++) dest.push([p + i * (dw + 8), rtop + 6]);
  const yr = cy - cs / 2 - 14 - ch - 30;
  const scr = ([[0, 0, -8], [0.55, 0.08, 7], [0.04, 0.5, -5], [0.52, 0.66, 6], [0.27, 1, -7]] as const).map(
    (s): Scr => [p + 4 + s[0] * (w - 2 * p - cw - 8), 30 + s[1] * yr, s[2]],
  );
  return { w, h, land, cw, ch, tool, scr, row, dest, cs, cx: w / 2, cy, rw, rx: p, rh, dw, dh };
}
