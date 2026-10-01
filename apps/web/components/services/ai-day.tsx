"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { emphasize } from "@/components/kit";
import { useElementSize, useInView, useReducedMotion } from "@/components/motion";
import type { AiConsultStep, AiDayContent } from "@/lib/content";
import { AiIllustration } from "./ai-illustrations";

/**
 * One day of AI consulting: a Morning / Midday / Afternoon stepper over a day
 * timeline (find, build, team using it). Selecting a tab slides the "Now"
 * marker and fill line, builds that stop's illustration with a stagger and swaps
 * the copy. Wide screens accumulate illustrations; narrow ones show the current
 * stop only. On first view it walks through the day once unless the visitor
 * takes over. Reduced motion: no auto-advance, no transitions.
 */

const AUTO_MS = 2500;
const NARROW_PX = 700;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const SLIDE = "[transition:left_.9s_cubic-bezier(.4,0,.2,1),width_.9s_cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none";

function Timeline({ stage, width, height, timeline, steps }: { stage: number; width: number; height: number; timeline: AiDayContent["timeline"]; steps: readonly AiConsultStep[] }) {
  const narrow = width < NARROW_PX;
  const ih = (narrow ? Math.min(width - 48, 300) : Math.min(340, width * 0.28)) * (150 / 240);
  const iw = (ih * 240) / 150;
  const top = Math.max((height - (ih + 60 + 72)) / 2, 8);
  const ty = top + ih + 60;
  const x0 = 28;
  const x1 = width - 28;
  const xs = [0.2, 0.5, 0.8].map((f) => width * f);
  const nx = stage < 0 ? x0 : (xs[stage] ?? x0);
  const labels = narrow ? timeline.short : timeline.long;

  // Geometry changes on resize must not animate: flag them for one frame.
  const [instant, setInstant] = useState(false);
  useIsoLayoutEffect(() => {
    setInstant(true);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  const endLabel = "absolute font-display text-[0.8125rem] uppercase tracking-[0.08em] text-muted-foreground";

  return (
    <div
      role="img"
      aria-label={timeline.ariaLabel}
      className={`absolute inset-0 overflow-hidden ${instant ? "[&_*]:!transition-none" : ""}`}
    >
      <div className="absolute h-0.5 rounded-[1px] bg-border" style={{ left: x0, top: ty, width: x1 - x0 }} />
      <div
        className={`absolute h-0.5 rounded-[1px] bg-primary ${SLIDE}`}
        style={{ left: x0, top: ty, width: Math.max(nx - x0, 0) }}
      />
      {Array.from({ length: 11 }, (_, k) => (
        <i key={k} className="absolute h-2 w-px bg-input" style={{ left: x0 + (k * (x1 - x0)) / 10, top: ty - 4 }} />
      ))}

      {xs.map((sx, i) => {
        const pass = i <= stage;
        const visible = narrow ? i === stage : i <= stage;
        return (
          <div key={i}>
            <div className="absolute w-0" style={{ left: sx, top: ty }}>
              <i
                className={`absolute -left-[7px] -top-[7px] size-3.5 rounded-full border-2 transition-[background-color,border-color] duration-[400ms] motion-reduce:transition-none ${
                  pass ? "border-primary bg-primary" : "border-input bg-secondary"
                }`}
              />
              <span
                className={`absolute left-0 top-4 -translate-x-1/2 whitespace-nowrap font-display text-[0.8125rem] font-medium uppercase tracking-[0.08em] transition-colors duration-[400ms] motion-reduce:transition-none ${
                  pass ? "text-primary-ink" : "text-muted-foreground"
                }`}
              >
                {steps[i]?.step} {labels[i]}
              </span>
            </div>
            <AiIllustration
              index={i}
              visible={visible}
              className="absolute"
              style={{ width: iw, height: ih, left: (narrow ? width / 2 : sx) - iw / 2, top }}
            />
          </div>
        );
      })}

      <span className={endLabel} style={{ left: x0, top: ty + 52 }}>
        {timeline.start}
      </span>
      <span className={endLabel} style={{ right: width - x1, top: ty + 52 }}>
        {timeline.end}
      </span>

      <div className={`absolute z-[3] size-0 ${SLIDE}`} style={{ left: nx, top: ty }}>
        <span aria-hidden className="absolute -left-2 -top-2 size-4 animate-ping rounded-full bg-primary opacity-30 [animation-duration:2.4s] motion-reduce:animate-none" />
        <i className="absolute -left-2 -top-2 size-4 rounded-full bg-primary" />
        <span className="absolute left-0 top-[-34px] -translate-x-1/2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-primary-ink">
          {timeline.now}
        </span>
      </div>
    </div>
  );
}

export function AiDay({ aiDay, steps }: { aiDay: AiDayContent; steps: readonly AiConsultStep[] }) {
  const { tabs, tabsLabel, stepEmphasis, stepLabels } = aiDay;
  const uid = useId();
  const tabId = (i: number) => `${uid}-tab-${i}`;
  const panelId = `${uid}-panel`;
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(stageRef);
  const seen = useInView(stageRef, { threshold: 0.4, once: true, enabled: !reduced });
  const [sel, setSel] = useState(0);
  const [step, setStep] = useState(-1);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const interacted = useRef(false);
  const timers = useRef<number[]>([]);

  const stop = () => {
    interacted.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const select = (i: number, focus = false) => {
    setSel(i);
    setStep(i);
    if (focus) tabRefs.current[i]?.focus();
  };

  // First view: build the morning, then walk through midday and afternoon once.
  useEffect(() => {
    if (!seen || interacted.current) return;
    select(0);
    timers.current = [window.setTimeout(() => select(1), AUTO_MS), window.setTimeout(() => select(2), AUTO_MS * 2)];
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [seen]);

  const onKeyDown = (e: KeyboardEvent) => {
    const n = tabs.length;
    let i = sel;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") i = (sel + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = (sel + n - 1) % n;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = n - 1;
    else return;
    e.preventDefault();
    stop();
    select(i, true);
  };

  const current = steps[sel];
  return (
    <>
      <div
        role="tablist"
        aria-label={tabsLabel}
        onPointerDown={stop}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-[30rem] gap-1.5 rounded-full border border-border bg-secondary p-1.5"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(i)}
            aria-selected={i === sel}
            aria-controls={panelId}
            tabIndex={i === sel ? 0 : -1}
            onClick={() => {
              stop();
              select(i);
            }}
            className="min-h-12 flex-1 rounded-full px-3 py-2.5 font-display text-[0.9375rem] font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary-ink aria-selected:text-primary-foreground aria-selected:hover:text-primary-foreground motion-reduce:transition-none"
          >
            {tab}
          </button>
        ))}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(sel)}>
        <div
          ref={stageRef}
          className="relative mt-5 h-[380px] overflow-hidden rounded-[1.25rem] border border-border bg-secondary min-[700px]:h-[430px]"
        >
          {size.width >= 100 && size.height >= 100 && (
            <Timeline stage={reduced ? sel : step} width={size.width} height={size.height} timeline={aiDay.timeline} steps={steps} />
          )}
        </div>
        {current && (
          <div key={sel} className="mt-7 max-w-[44rem] motion-safe:animate-fade-up">
            <p className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary-ink">
              {stepLabels[sel]}
            </p>
            <h2 className="mt-3 text-balance text-[clamp(1.9rem,4vw,2.6rem)] font-light leading-[1.12] tracking-[-0.02em]">
              {emphasize(current.title, stepEmphasis[sel] ?? "")}
            </h2>
            <p className="mt-3.5 max-w-[36rem] text-muted-foreground">{current.description}</p>
          </div>
        )}
      </div>
    </>
  );
}
