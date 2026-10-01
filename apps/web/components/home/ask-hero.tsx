"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FlowDots, useElementSize, useInView, useReducedMotion } from "@/components/motion";
import type { AskHeroContent, ToolItem } from "@/lib/content";
import { TOOL_BG, TOOL_COLOR } from "./tool-colors";

/** One question's beat: type (40ms/char) -> chips light up -> answer in -> answer out -> next question at 5s. */
function AskScene({ w, h, active, reduced, askHero, tools }: { w: number; h: number; active: boolean; reduced: boolean; askHero: AskHeroContent; tools: readonly ToolItem[] }) {
  const ITEMS = askHero.items;
  const [qi, setQi] = useState(0);
  const first = ITEMS[0];
  const [typed, setTyped] = useState(reduced ? first.question.length : 0);
  const [typing, setTyping] = useState(false);
  const [lit, setLit] = useState(reduced);
  const [ans, setAns] = useState(reduced);
  const d = ITEMS[qi] ?? first;

  useEffect(() => {
    const item = ITEMS[qi] ?? first;
    if (reduced) {
      setQi(0);
      setTyped(first.question.length); setTyping(false); setLit(true); setAns(true);
      return;
    }
    if (!active) return;
    const len = item.question.length;
    setTyped(0); setTyping(true); setLit(false); setAns(false);
    let n = 0;
    const iv = setInterval(() => {
      n += 1;
      setTyped(n);
      if (n >= len) { clearInterval(iv); setTyping(false); }
    }, 40);
    const tq = len * 40;
    const ts = [
      setTimeout(() => setLit(true), tq + 300),
      setTimeout(() => setAns(true), tq + 1500),
      setTimeout(() => setAns(false), 4300),
      setTimeout(() => setQi((q) => (q + 1) % ITEMS.length), 5000),
    ];
    return () => { clearInterval(iv); ts.forEach(clearTimeout); };
  }, [qi, active, reduced, first, ITEMS]);

  const cmp = w < 520 || h < 400;
  const pad = cmp ? 14 : 24;
  const chW = cmp ? 104 : 124;
  const chH = cmp ? 28 : 36;
  const qH = cmp ? 38 : 46;
  const aH = cmp ? 44 : 58;
  const gap = cmp ? 10 : 18;
  const y0 = pad + qH + gap;
  const y1 = h - pad - aH - gap;
  const zH = y1 - y0;
  const pitch = Math.min(chH + (cmp ? 6 : 16), (zH - chH) / 4);
  const top = y0 + (zH - (chH + 4 * pitch)) / 2;
  const bx = pad + chW + (w - 2 * pad - chW) * 0.56;
  const by = y0 + zH / 2;
  const sc = Math.min(cmp ? 100 : 170, zH * 0.6, (w - 2 * pad - chW) * 0.5) / 64;

  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="absolute inset-0 block h-full w-full">
        {tools.map((t, i) => {
          const cy = top + i * pitch;
          const sx = pad + chW;
          const sy = cy + chH / 2;
          const dx = (bx - sx) * 0.5;
          const path = `M${sx} ${sy} C ${sx + dx} ${sy} ${bx - dx} ${by} ${bx} ${by}`;
          const on = lit && d.toolIds.includes(t.id);
          return (
            <path
              key={t.id} d={path} fill="none" strokeWidth={1.5} strokeLinecap="round"
              className="[transition:stroke-opacity_.4s]" style={{ stroke: TOOL_COLOR[t.id], strokeOpacity: on ? 0.65 : 0.22 }}
            />
          );
        })}
        {tools.map((t, i) => {
          const cy = top + i * pitch;
          const sx = pad + chW;
          const sy = cy + chH / 2;
          const dx = (bx - sx) * 0.5;
          const path = `M${sx} ${sy} C ${sx + dx} ${sy} ${bx - dx} ${by} ${bx} ${by}`;
          const on = lit && d.toolIds.includes(t.id);
          return (
            <g key={t.id} className={`[transition:opacity_.4s] ${on ? "opacity-100" : "opacity-0"}`}>
              <FlowDots d={path} color={TOOL_COLOR[t.id]} n={4} r={3.6} period={1.9 + i * 0.12} showPath={false} active={on} />
            </g>
          );
        })}
        {/* one building block: the logo's left cube, static */}
        <g className={`origin-center [transform-box:fill-box] [transition:transform_.6s_cubic-bezier(.3,1.4,.5,1)] ${lit ? "scale-[1.07]" : ""}`}>
          <g
            transform={`translate(${bx} ${by}) scale(${sc}) translate(-110 -28.5)`} strokeWidth={2 / sc} strokeLinejoin="round"
            className="stroke-foreground/85 dark:stroke-foreground/50"
          >
            <path d="M110 -8.5 L142 10 L110 28.5 L78 10 Z" className="fill-cube-top" />
            <path d="M78 10 L110 28.5 L110 65.5 L78 47 Z" className="fill-cube-left" />
            <path d="M110 28.5 L142 10 L142 47 L110 65.5 Z" className="fill-cube-right" />
          </g>
        </g>
      </svg>

      {tools.map((t, i) => {
        const on = lit && d.toolIds.includes(t.id);
        return (
          <div
            key={t.id}
            className={`absolute flex items-center whitespace-nowrap rounded-[10px] border bg-card font-display font-medium leading-none text-foreground [transition:opacity_.4s,border-color_.4s,box-shadow_.4s] ${
              cmp ? "gap-[7px] px-[9px] text-[12.5px]" : "gap-2 px-[11px] text-sm"
            } ${lit && !on ? "opacity-35" : ""} ${on ? "" : "border-input"}`}
            style={{
              left: pad, top: top + i * pitch, width: chW, height: chH,
              ...(on ? { borderColor: TOOL_COLOR[t.id], boxShadow: `0 0 0 3px color-mix(in srgb, ${TOOL_COLOR[t.id]} 20%, transparent)` } : null),
            }}
          >
            <i className={`size-[9px] flex-none rounded-full ${TOOL_BG[t.id]}`} />
            {t.short}
          </div>
        );
      })}

      <div
        className={`absolute flex items-center rounded-[16px_16px_16px_4px] border border-input bg-card px-4 font-display font-medium leading-[1.35] transition-opacity duration-[400ms] ${
          cmp ? "text-[15px]" : "text-[17px]"
        } ${typed === 0 ? "opacity-0" : ""}`}
        style={{ left: pad, top: pad, height: qH }}
      >
        <span aria-live="off">
          {d.question.slice(0, typed)}
          {typing && (
            <motion.span
              aria-hidden="true" className="ml-0.5 inline-block h-[1.05em] w-0.5 bg-primary align-[-.15em]"
              animate={{ opacity: [1, 1, 0, 0] }} transition={{ duration: 0.8, times: [0, 0.49, 0.5, 1], repeat: Infinity, ease: "linear" }}
            />
          )}
        </span>
      </div>

      <div
        aria-live="off"
        className={`absolute flex items-center rounded-[16px_16px_4px_16px] border border-accent bg-[color-mix(in_srgb,hsl(var(--accent))_14%,hsl(var(--card)))] px-4 leading-[1.35] [transition:opacity_.4s_ease,transform_.4s_ease] ${
          cmp ? "text-sm" : "text-base"
        } ${ans ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
        style={{ right: pad, bottom: pad, maxWidth: `calc(100% - ${pad * 2}px)`, minHeight: aH }}
      >
        <span>
          <b className="font-display font-semibold">{d.answerLead}</b> {d.answerRest}
        </span>
      </div>
    </>
  );
}

/** Hero art: the time-based "ask it anything" loop. Pauses off-screen and in hidden tabs; static frame under reduced motion. */
export function AskHero({ askHero, tools }: { askHero: AskHeroContent; tools: readonly ToolItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const inView = useInView(ref, { rootMargin: "40px" });
  const reduced = useReducedMotion();
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const sync = () => setTabHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <div
      ref={ref} role="img" aria-label={askHero.ariaLabel}
      className="relative min-h-[300px] min-w-0 overflow-hidden rounded-[20px] border border-border bg-secondary lg:min-h-[460px]"
    >
      {size.width >= 100 && size.height >= 100 && (
        <AskScene key={`${size.width}x${size.height}`} w={size.width} h={size.height} active={inView && !tabHidden && !reduced} reduced={reduced} askHero={askHero} tools={tools} />
      )}
    </div>
  );
}
