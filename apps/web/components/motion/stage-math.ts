/** Pure scroll maths for PinnedStage (ported from the prototype's pinStage). */

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export interface StageProgress {
  /** overall 0..1 through the track */
  f: number;
  /** continuous position, 0..n */
  P: number;
  /** active step */
  step: number;
  /** 0..1 progress inside the active step */
  p: number;
}

/**
 * trackTop: track's getBoundingClientRect().top; pinTop: the sticky `top` offset in px;
 * range: track height minus pinned panel height (the scrollable distance).
 */
export function stageProgress(trackTop: number, pinTop: number, range: number, n: number): StageProgress {
  const f = clamp01((pinTop - trackTop) / Math.max(range, 1));
  const P = f * n;
  const step = Math.min(n - 1, Math.floor(P));
  return { f, P, step, p: clamp01(P - step) };
}

/** window.scrollY that parks step `i` mid-way through its slice of the track. */
export function stepScrollTop(trackAbsTop: number, pinTop: number, range: number, n: number, i: number): number {
  return trackAbsTop - pinTop + ((i + 0.5) / n) * Math.max(range, 1);
}
