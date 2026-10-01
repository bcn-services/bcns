"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clamp01, stageProgress, stepScrollTop, type StageProgress } from "./stage-math";
import { useElementSize, type Size } from "./use-element-size";
import { useMediaQuery } from "./use-media-query";

export interface StageStep {
  /** small uppercase eyebrow, e.g. "Step 1" */
  label: string;
  title: string;
  /** substring of `title` set in the accent style (optional) */
  emphasis?: string;
  description?: string;
}

export interface PinnedStageProps {
  steps: readonly StageStep[];
  /**
   * Draw the picture for `step`. Return a React node (SVG or DOM); it is placed in an
   * `absolute inset-0` box of exactly `size` px. `progress` is 0..1 inside the active step
   * while pinned (>=1024px, motion allowed); in the stacked layout every step is drawn
   * with progress = 1 (its end state). Never called until the box has been measured, so
   * it is never called during SSR. Keep one stable element tree across steps so CSS
   * transitions between steps animate.
   */
  renderFrame: (step: number, progress: number, size: Size) => ReactNode;
  /** stacked-layout frame height in px (default 340) */
  figHeight?: number;
  /** sticky site-header height in px, the pinned panel centres below it (default 64) */
  headerOffset?: number;
  /** aria-label of the step rail (default "Steps") */
  railLabel?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

const vars = (o: Record<string, string | number>): CSSProperties => o as CSSProperties; // custom properties are not in CSSProperties

function Title({ title, emphasis }: { title: string; emphasis?: string }) {
  const at = emphasis ? title.indexOf(emphasis) : -1;
  if (!emphasis || at === -1) return <>{title}</>;
  return (
    <>
      {title.slice(0, at)}
      <b className="font-semibold text-primary">{emphasis}</b>
      {title.slice(at + emphasis.length)}
    </>
  );
}

const EYEBROW = "font-display text-[13px] font-medium uppercase tracking-[.16em] text-[hsl(var(--primary-ink))]";
const PINNED_MQ = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";

function StackedFig({ index, renderFrame }: { index: number; renderFrame: PinnedStageProps["renderFrame"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  return (
    <div ref={ref} className="relative mt-7 h-[var(--fig-h)] w-full overflow-hidden rounded-[18px] border border-border bg-secondary">
      {size.width > 0 && size.height > 0 && <div className="absolute inset-0">{renderFrame(index, 1, size)}</div>}
    </div>
  );
}

export function PinnedStage({
  steps, renderFrame, figHeight = 340, headerOffset = 64, railLabel = "Steps", className = "", id, "aria-label": ariaLabel,
}: PinnedStageProps) {
  const n = steps.length;
  const pinned = useMediaQuery(PINNED_MQ);
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const diaRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(diaRef, pinned);
  const [prog, setProg] = useState<StageProgress>({ f: 0, P: 0, step: 0, p: 0 });
  const last = useRef(-1);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!track || !pin || n < 1) return null;
    const pinTop = parseFloat(getComputedStyle(pin).top) || 0;
    const range = Math.max(track.offsetHeight - pin.offsetHeight, 1);
    return { pinTop, range, trackTop: track.getBoundingClientRect().top };
  }, [n]);

  useEffect(() => {
    if (!pinned) return;
    let raf = 0;
    const paint = (force: boolean) => {
      const m = measure();
      if (!m) return;
      const s = stageProgress(m.trackTop, m.pinTop, m.range, n);
      if (force || Math.floor(s.P) !== Math.floor(last.current) || Math.abs(s.P - last.current) > 0.002) {
        last.current = s.P;
        setProg(s);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(false); }); };
    paint(true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pinned, n, measure]);

  const jump = (i: number) => {
    const m = measure();
    if (!m) return;
    window.scrollTo({
      top: stepScrollTop(m.trackTop + window.scrollY, m.pinTop, m.range, n, i),
      behavior: "smooth",
    });
  };

  return (
    <section
      id={id} aria-label={ariaLabel} className={`relative ${className}`}
      style={vars({ "--steps": n, "--hdr": `${headerOffset}px`, "--ph": "max(calc(100vh - 128px), 560px)", "--fig-h": `${figHeight}px` })}
    >
      {/* pinned: >=1024px, motion allowed (display chosen by CSS so SSR/hydration agree) */}
      <div ref={trackRef} className="mx-auto hidden h-[calc(var(--steps)*100vh)] max-w-[90rem] px-[72px] min-[1024px]:motion-safe:block">
        <div ref={pinRef} className="sticky top-[calc(var(--hdr)_+_(100vh_-_var(--hdr)_-_var(--ph))_/_2)]">
          <div className="grid h-[var(--ph)] grid-cols-[1fr_84px] grid-rows-[1fr_auto] overflow-hidden rounded-[20px] border border-border bg-secondary">
            <div ref={diaRef} className="relative min-h-0 min-w-0">
              {pinned && size.width > 0 && size.height > 0 && (
                <div className="absolute inset-0">{renderFrame(prog.step, prog.p, size)}</div>
              )}
            </div>
            <div className="col-start-1 row-start-2 grid border-t border-border bg-background/60 px-8 pb-[22px] pt-[18px] text-center">
              {steps.map((s, i) => (
                <div
                  key={i} aria-hidden={i !== prog.step}
                  className={`pointer-events-none col-start-1 row-start-1 translate-y-2 opacity-0 transition-[opacity,transform] duration-[450ms] ${i === prog.step ? "!pointer-events-auto !translate-y-0 !opacity-100" : ""}`}
                >
                  <p className={EYEBROW}>{s.label}</p>
                  <h2 className="mt-1.5 font-display text-[clamp(1.5rem,2.5vw,2.1rem)] font-light leading-[1.12] tracking-[-.02em]"><Title title={s.title} emphasis={s.emphasis} /></h2>
                  {s.description && <p className="mt-1.5 text-base leading-normal text-muted-foreground">{s.description}</p>}
                </div>
              ))}
            </div>
            <nav aria-label={railLabel} className="col-start-2 row-span-2 row-start-1 flex flex-col items-center justify-center gap-1.5 border-l border-border bg-background">
              {steps.map((s, i) => (
                <button
                  key={i} type="button" onClick={() => jump(i)} aria-current={i === prog.step ? "step" : undefined}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  className="group flex cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-2.5 py-2 hover:bg-secondary"
                >
                  <span className={`w-5 text-left font-display text-[13px] font-medium transition-colors duration-300 group-hover:text-[hsl(var(--primary-ink))] ${i === prog.step ? "text-[hsl(var(--primary-ink))]" : "text-muted-foreground"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="relative h-16 w-1 overflow-hidden rounded-sm bg-border">
                    <i className="absolute inset-0 origin-top bg-primary" style={{ transform: `scaleY(${clamp01(prog.P - i).toFixed(3)})` }} />
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* stacked: everything else; each step shows its end state */}
      <ol className="block min-[1024px]:motion-safe:hidden">
        {steps.map((s, i) => (
          <li key={i} className="mx-auto max-w-[40rem] border-t border-border px-5 pb-[52px] pt-12">
            <p className={EYEBROW}>{s.label}</p>
            <h2 className="mt-3.5 font-display text-[clamp(1.9rem,5vw,2.6rem)] font-light leading-[1.12] tracking-[-.02em] [text-wrap:balance]"><Title title={s.title} emphasis={s.emphasis} /></h2>
            {s.description && <p className="mt-3.5 max-w-[28rem] text-muted-foreground">{s.description}</p>}
            {!pinned && <StackedFig index={i} renderFrame={renderFrame} />}
          </li>
        ))}
      </ol>
    </section>
  );
}
