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
  /** phase-0 resting spot of each of the 30 dots (clear of every scrambled card and the target circle), or null = hide it */
  loose: (Pt | null)[];
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Tilt of each scrambled card, degrees. */
export const SCR_TILT = [-7, 5, -4, 7, -6];
/** Clearance kept around every scrambled card (px, measured from its rotated bounding box). */
export const SCR_GAP = 12;
const JIT = [0.15, 0.9, 0.45, 1, 0.05];

/** Rotated bounding box of a cw x ch card tilted by r degrees. */
export function tiltBox(cw: number, ch: number, r: number): { w: number; h: number } {
  const a = (Math.abs(r) * Math.PI) / 180;
  return { w: cw * Math.cos(a) + ch * Math.sin(a), h: cw * Math.sin(a) + ch * Math.cos(a) };
}

/**
 * Stack cards `ids` in one column inside [x0,x1] x [y0,y1]: x jitters across the slack, y is spaced by the
 * ROTATED bounding boxes with at least SCR_GAP between them, so cards never touch however they tilt.
 */
function column(ids: number[], cw: number, ch: number, x0: number, x1: number, y0: number, y1: number, out: Scr[]) {
  const bb = ids.map((i) => tiltBox(cw, ch, SCR_TILT[i] ?? 0));
  const sum = bb.reduce((t, b) => t + b.h, 0);
  const g = ids.length > 1 ? clamp((y1 - y0 - sum) / (ids.length - 1), SCR_GAP + 2, 44) : 0;
  let y = y0 + (y1 - y0 - sum - g * (ids.length - 1)) / 2;
  ids.forEach((id, j) => {
    const b = bb[j] ?? { w: cw, h: ch };
    const cx = x0 + b.w / 2 + Math.max(0, x1 - x0 - b.w) * (JIT[j % JIT.length] ?? 0);
    const cy = y + b.h / 2;
    out[id] = [cx - cw / 2, cy - ch / 2, SCR_TILT[id] ?? 0];
    y += b.h + g;
  });
}

/** Seeded LCG so the loose dots land in the same places every render. */
function rng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** Phase-0 dots: each near its own tool card, but never on any card (rejection sampled) or inside the target circle. */
function looseDots(scr: Scr[], cw: number, ch: number, w: number, h: number, c: { x: number; y: number; r: number }): (Pt | null)[] {
  const R = rng(7);
  const boxes = scr.map((s) => {
    const b = tiltBox(cw, ch, s[2]);
    return { cx: s[0] + cw / 2, cy: s[1] + ch / 2, hw: b.w / 2 + 10, hh: b.h / 2 + 10 };
  });
  return Array.from({ length: 30 }, (_, k) => {
    const own = boxes[((k % 6) + Math.floor(k / 6) * 2) % 5];
    if (!own) return null;
    for (let t = 0; t < 120; t++) {
      const x = own.cx + (R() * 2 - 1) * (own.hw + 46);
      const y = own.cy + (R() * 2 - 1) * (own.hh + 36);
      if (x < 10 || x > w - 10 || y < 10 || y > h - 10) continue;
      if (Math.hypot(x - c.x, y - c.y) < c.r + 10) continue;
      if (boxes.every((b) => Math.abs(x - b.cx) > b.hw || Math.abs(y - b.cy) > b.hh)) return [x, y] as const;
    }
    return null;
  });
}

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
    const scr: Scr[] = [];
    column([0, 1, 2, 3, 4], cw, ch, pad, w / 2 - cs / 2 - 24, 12, h - 12, scr); // scramble zone sits left of the cube
    const loose = looseDots(scr, cw, ch, w, h, { x: w / 2, y: h / 2, r: cs * 0.42 });
    return { w, h, land, cw, ch, tool, scr, row, dest, cs, cx: w / 2, cy: h / 2, rw, rx, rh, dw: rw, dh, loose };
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
  /* scramble: wide enough, two columns flank the target circle; otherwise 2 cards above it and 3 below */
  const r = cs * 0.42;
  const bw = Math.max(...SCR_TILT.map((t) => tiltBox(cw, ch, t).w));
  const free = w - 2 * p - 2 * bw - 2 * (r + SCR_GAP);
  const scr: Scr[] = [];
  if (free >= 0) {
    const ext = free / 2;
    column([0, 2, 4], cw, ch, p, p + bw + ext, p, h - p, scr);
    column([1, 3], cw, ch, w - p - bw - ext, w - p, p, h - p, scr);
  } else {
    column([0, 1], cw, ch, p, w - p, p, cy - r - SCR_GAP, scr);
    column([2, 3, 4], cw, ch, p, w - p, cy + r + SCR_GAP, h - p, scr);
  }
  const loose = looseDots(scr, cw, ch, w, h, { x: w / 2, y: cy, r });
  return { w, h, land, cw, ch, tool, scr, row, dest, cs, cx: w / 2, cy, rw, rx: p, rh, dw, dh, loose };
}
