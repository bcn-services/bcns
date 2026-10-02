"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clamp01, stageProgress, stepScrollTop } from "./stage-math";
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
   * `absolute inset-0` box of exactly `size` px. It re-renders only when the active step
   * changes (scroll position inside a step is not passed: the rail fill is written straight
   * to the DOM), and in the stacked layout every step is drawn at its end state. Never
   * called until the box has been measured, so never during SSR. Keep one stable element
   * tree across steps so CSS transitions between steps animate.
   */
  renderFrame: (step: number, size: Size) => ReactNode;
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
/** Pinned needs room for the 560px panel under the 64px header, so short windows get the stacked layout. */
const PINNED_MQ = "(min-width: 1024px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)";
const PINNED_SHOW = "[@media(min-width:1024px)_and_(min-height:640px)]:motion-safe:block";
const PINNED_HIDE = "[@media(min-width:1024px)_and_(min-height:640px)]:motion-safe:hidden";

function StackedFig({ index, renderFrame }: { index: number; renderFrame: PinnedStageProps["renderFrame"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  return (
    <div ref={ref} className="relative mt-7 h-[var(--fig-h)] w-full overflow-hidden rounded-[18px] border border-border bg-secondary">
      {size.width > 0 && size.height > 0 && <div className="absolute inset-0">{renderFrame(index, size)}</div>}
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
  const [step, setStep] = useState(0);
  const geo = useRef({ pinTop: 0, range: 1 });
  const fills = useRef<(HTMLElement | null)[]>([]);

  /** pinTop / range only change with layout, so they are cached and refreshed by a ResizeObserver, never read per scroll tick. */
  const measure = useCallback(() => {
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!track || !pin || n < 1) return null;
    geo.current = { pinTop: parseFloat(getComputedStyle(pin).top) || 0, range: Math.max(track.offsetHeight - pin.offsetHeight, 1) };
    return track;
  }, [n]);

  useEffect(() => {
    if (!pinned) return;
    const track = measure();
    const pin = pinRef.current;
    if (!track || !pin) return;
    let raf = 0;
    const paint = () => {
      const s = stageProgress(track.getBoundingClientRect().top, geo.current.pinTop, geo.current.range, n);
      fills.current.forEach((el, i) => { if (el) el.style.transform = `scaleY(${clamp01(s.P - i).toFixed(3)})`; });
      setStep(s.step); // same value = no re-render
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
    // scroll is only listened to while the track is on screen (+ a margin), so the rest of the page pays nothing
    const io = new IntersectionObserver(([e]) => {
      window.removeEventListener("scroll", onScroll);
      if (e?.isIntersecting) window.addEventListener("scroll", onScroll, { passive: true });
      paint(); // on leaving too, so a fast flick past the end settles on the first/last step
    }, { rootMargin: "120px 0px" });
    const ro = new ResizeObserver(() => { measure(); paint(); });
    io.observe(track);
    ro.observe(track);
    ro.observe(pin);
    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pinned, n, measure]);

  const jump = (i: number) => {
    const track = measure();
    if (!track) return;
    window.scrollTo({
      top: stepScrollTop(track.getBoundingClientRect().top + window.scrollY, geo.current.pinTop, geo.current.range, n, i),
      behavior: "smooth",
    });
  };

  return (
    <section
      id={id} aria-label={ariaLabel} className={`relative ${className}`}
      style={vars({ "--steps": n, "--hdr": `${headerOffset}px`, "--ph": "max(calc(100vh - 128px), 560px)", "--fig-h": `${figHeight}px` })}
    >
      {/* pinned: >=1024px, motion allowed (display chosen by CSS so SSR/hydration agree) */}
      <div ref={trackRef} className={`mx-auto hidden h-[calc(var(--steps)*100vh)] max-w-[90rem] px-[72px] ${PINNED_SHOW}`}>
        <div ref={pinRef} className="sticky top-[calc(var(--hdr)_+_(100vh_-_var(--hdr)_-_var(--ph))_/_2)]">
          <div className="grid h-[var(--ph)] grid-cols-[1fr_84px] grid-rows-[1fr_auto] overflow-hidden rounded-[20px] border border-border bg-secondary">
            <div ref={diaRef} className="relative min-h-0 min-w-0">
              {pinned && size.width > 0 && size.height > 0 && (
                <div className="absolute inset-0">{renderFrame(step, size)}</div>
              )}
            </div>
            <div className="col-start-1 row-start-2 grid border-t border-border bg-background/60 px-8 pb-[22px] pt-[18px] text-center">
              {steps.map((s, i) => (
                <div
                  key={i} aria-hidden={i !== step}
                  className={`pointer-events-none col-start-1 row-start-1 translate-y-2 opacity-0 transition-[opacity,transform] duration-[450ms] ${i === step ? "!pointer-events-auto !translate-y-0 !opacity-100" : ""}`}
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
                  key={i} type="button" onClick={() => jump(i)} aria-current={i === step ? "step" : undefined}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  className="group flex cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-2.5 py-2 hover:bg-secondary"
                >
                  <span className={`w-5 text-left font-display text-[13px] font-medium transition-colors duration-300 group-hover:text-[hsl(var(--primary-ink))] ${i === step ? "text-[hsl(var(--primary-ink))]" : "text-muted-foreground"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="relative h-16 w-1 overflow-hidden rounded-sm bg-border">
                    <i ref={(el) => { fills.current[i] = el; }} className="absolute inset-0 origin-top bg-primary" style={{ transform: "scaleY(0)" }} />
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* stacked: everything else; each step shows its end state */}
      <ol className={`block ${PINNED_HIDE}`}>
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
