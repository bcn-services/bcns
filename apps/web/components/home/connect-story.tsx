"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FlowDots, LogoCube, PinnedStage, restGeometry, useMediaQuery, useReducedMotion, type Size } from "@/components/motion";
import type { PillarItem, StoryContent, ToolItem } from "@/lib/content";
import { TOOL_COLOR, TOOL_FILL } from "./tool-colors";

const ANG = [-60, -30, 0, 30, 60].map((a) => (a * Math.PI) / 180);
const TILT = [-7, 5, -4, 7, -6];
const EASE = "cubic-bezier(.4,0,.2,1)";

interface Spot { x: number; y: number; cx: number; cy: number; r: number; hw: number; hh: number }
interface Pt { x: number; y: number; o: number }

/** Seeded LCG so the loose dots land in the same places every render. */
function rng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const tr = (x: number, y: number) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;

/**
 * Step 0: five tilted cards in two staggered columns. Clearance is by construction: columns never share x,
 * cards in a column are stacked by their ROTATED bounding boxes with a gap of at least 18px, so no pair ever
 * gets closer than 12px.
 */
function scatter(w: number, h: number, cw: number, ch: number): Spot[] {
  const bb = TILT.map((r) => {
    const a = (Math.abs(r) * Math.PI) / 180;
    return { w: cw * Math.cos(a) + ch * Math.sin(a), h: cw * Math.sin(a) + ch * Math.cos(a) };
  });
  const bw = Math.max(...bb.map((b) => b.w));
  const M = 14, G = 16;
  const OA = [-14, 0, -8], OB = [8, 22];
  const avail = w - 2 * M - 2 * bw - G;
  const jf = Math.max(0, Math.min(1, avail / 36));
  const ex = Math.max(0, Math.min(80, avail - 36 * jf));
  const X0 = (w - (2 * bw + G + ex + 36 * jf)) / 2 + 14 * jf;
  const X1 = X0 + bw + G + ex;
  const A = [0, 2, 4], B = [1, 3];
  const out: Spot[] = [];
  const HA = A.reduce((t, i) => t + (bb[i]?.h ?? 0), 0);
  const g = Math.max(18, Math.min(70, (h - 2 * M - HA) / 2));
  let y = (h - HA - 2 * g) / 2;
  const cys: number[] = [];
  A.forEach((i, j) => {
    const b = bb[i] ?? { w: 0, h: 0 };
    const cy = y + b.h / 2;
    out[i] = { cx: X0 + (OA[j] ?? 0) * jf + b.w / 2, cy, r: TILT[i] ?? 0, x: 0, y: 0, hw: 0, hh: 0 };
    cys.push(cy);
    y += b.h + g;
  });
  B.forEach((i, j) => {
    const b = bb[i] ?? { w: 0, h: 0 };
    out[i] = { cx: X1 + (OB[j] ?? 0) * jf + b.w / 2, cy: ((cys[j] ?? 0) + (cys[j + 1] ?? 0)) / 2, r: TILT[i] ?? 0, x: 0, y: 0, hw: 0, hh: 0 };
  });
  return out.map((o, i) => ({ ...o, x: o.cx - cw / 2, y: o.cy - ch / 2, hw: (bb[i]?.w ?? 0) / 2 + 12, hh: (bb[i]?.h ?? 0) / 2 + 12 }));
}

interface SceneProps {
  step: number; w: number; h: number;
  story: StoryContent; tools: readonly ToolItem[]; pillars: readonly PillarItem[];
}

/**
 * The one scene all five steps share: tools -> connection -> one block with sorted dots -> the three-block logo
 * -> a chart answer. Geometry is computed once per size (the caller keys on w x h); `step` only flips styles,
 * so every move is a CSS transition between stable elements.
 */
const StageScene = memo(function StageScene({ step, w, h, story, tools, pillars }: SceneProps) {
  const wide = useMediaQuery("(min-width: 900px)");
  const reduced = useReducedMotion();
  const narrow = w < 560;
  const VALUES = story.chart.values;
  const DOT_COUNT = VALUES.reduce((t, v) => t + v * 2, 0);

  const g = (() => {
    const cw = narrow ? 140 : 156;
    const ch = narrow ? 38 : 44;
    const { Wc, Hc, top, cx: ox } = restGeometry(w, h, wide, false);
    const oy = top + Hc / 2;
    const C1 = { x: w * (narrow ? 0.72 : 0.6), y: h / 2 };
    const bwB = narrow ? Math.min(108, w * 0.3) : Math.max(110, Math.min(200, w * 0.26 - 8, (h / 2 - 8) / 1.44));
    const s1 = bwB / (0.5 * Wc);
    const Lx = -0.25 * Wc;
    const Ly = (0.714286 - 0.5) * Hc;
    const Rx = bwB / 2 + (narrow ? 36 : 90) + cw / 2;
    const Ry = Math.min(300, (h / 2 - ch / 2 - 12) / 0.866);
    const arc = ANG.map((a) => ({ x: C1.x - Rx * Math.cos(a) - cw / 2, y: C1.y + Ry * Math.sin(a) - ch / 2 }));
    const scr = scatter(w, h, cw, ch);

    const cg = narrow
      ? { x0: w * 0.1, x1: w * 0.92, base: h * 0.66, maxH: h * 0.3, cube: { x: w * 0.17, y: h * 0.19, s: 0.38 }, q: { x: w * 0.34, y: h * 0.05 }, a: { x: w * 0.06, y: h * 0.66 + 38 } }
      : { x0: w * 0.46, x1: w * 0.92, base: h * 0.7, maxH: h * 0.32, cube: { x: w * 0.2, y: h * 0.5, s: 0.72 }, q: { x: w * 0.46, y: h * 0.13 }, a: { x: w * 0.46, y: h * 0.7 + 42 } };
    const R = rng(11);
    const pb = Math.min(narrow ? 14 : 17, cg.maxH / 7);
    const slot = (cg.x1 - cg.x0) / 7;
    const bw = 2 * pb + 8;
    const bars = VALUES.map((rw, b) => ({ x: cg.x0 + slot * (b + 0.5) - bw / 2, bx: cg.x0 + slot * (b + 0.5), rw }));
    const chartPts: Pt[] = [];
    VALUES.forEach((rw, b) => {
      const bx = cg.x0 + slot * (b + 0.5);
      for (let j = 0; j < rw * 2; j++) chartPts.push({ x: bx + ((j % 2) - 0.5) * pb, y: cg.base - pb * (Math.floor(j / 2) + 0.5) - 3, o: 1 });
    });

    /* step 0 loose dots: scattered in the gaps, never on a card (rejection sampled against the padded card boxes) */
    const free = (x: number, y: number) => scr.every((c) => Math.abs(x - c.cx) > c.hw + 6 || Math.abs(y - c.cy) > c.hh + 6);
    const dots: Pt[][] = [];
    for (let k = 0; k < DOT_COUNT; k++) {
      let pt: Pt = { x: w / 2, y: h / 2, o: 0 };
      if (k < 22) {
        for (let tries = 0; tries < 60; tries++) {
          const x = 12 + R() * (w - 24);
          const y = 12 + R() * (h - 24);
          if (free(x, y)) { pt = { x, y, o: 1 }; break; }
        }
      }
      const a = arc[k % 5] ?? { x: 0, y: 0 };
      dots[k] = [
        pt,
        { x: a.x + cw, y: a.y + ch / 2, o: 0 },
        { x: C1.x, y: C1.y, o: 0 },
        { x: cg.cube.x, y: cg.cube.y, o: 0 },
        chartPts[k] ?? { x: cg.cube.x, y: cg.cube.y, o: 0 },
      ];
    }

    const Eo = Math.min(wide ? 150 : 100, (w / 3) * 0.74);
    const s3 = Math.min(1.15, (w / 2 - 52) / (w / 3 + Eo / 2));
    const Yo = (h - 40) / 2;
    const y3 = oy + (Yo - oy) * s3;
    const lw = (w / 3) * s3 - 12;
    return { cw, ch, ox, oy, C1, bwB, s1, Lx, Ly, arc, scr, cg, pb, bw, bars, dots, Eo, s3, y3, lw };
  })();

  /* step 3 is two beats: the other blocks fade in around the first, then the logo centres and turns face-on */
  const [go, setGo] = useState(step === 3);
  const prev = useRef(step);
  useEffect(() => {
    const was = prev.current;
    prev.current = step;
    if (step !== 3) { setGo(false); return; }
    if (was === 2 && !reduced) {
      const t = setTimeout(() => setGo(true), 750);
      return () => clearTimeout(t);
    }
    setGo(true);
  }, [step, reduced]);

  const { cg, ox, oy, s1, s3 } = g;
  const seat = { x: g.C1.x - ox - g.Lx * s1, y: g.C1.y - oy - g.Ly * s1 };
  const pose = step === 4 ? { x: cg.cube.x - ox, y: cg.cube.y - oy, s: cg.cube.s }
    : step === 3 && go ? { x: 0, y: 0, s: s3 }
    : { x: seat.x, y: seat.y, s: s1 };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={story.diagramLabel} className="absolute inset-0 block h-full w-full">
        <g className={`[transition:opacity_.7s] ${step === 1 || step === 2 ? "opacity-100" : "opacity-0"}`}>
          {tools.map((t, i) => {
            const a = g.arc[i] ?? { x: 0, y: 0 };
            const sx = a.x + g.cw;
            const sy = a.y + g.ch / 2;
            const d = `M${sx} ${sy} C ${sx + 60} ${sy} ${g.C1.x - g.bwB / 2 - 50} ${g.C1.y} ${g.C1.x} ${g.C1.y}`;
            return <FlowDots key={t.id} d={d} color={TOOL_COLOR[t.id]} n={4} r={3.4} period={3.2 + i * 0.25} active={step === 1 || step === 2} />;
          })}
        </g>
        <g>
          {tools.map((t, i) => {
            const o = step === 0 ? g.scr[i] : g.arc[i];
            const rot = step === 0 ? (g.scr[i]?.r ?? 0) : 0;
            return (
              <g
                key={t.id}
                className="origin-center [transform-box:fill-box]"
                style={{
                  transform: `${tr(o?.x ?? 0, o?.y ?? 0)} rotate(${rot}deg) scale(${step >= 3 ? 0.85 : 1})`,
                  opacity: step === 2 ? 0.5 : step >= 3 ? 0 : 1,
                  transition: `transform .9s ${EASE}, opacity .7s`,
                }}
              >
                <rect width={g.cw} height={g.ch} rx={12} className="fill-card stroke-input stroke-[1.2]" />
                <circle cx={18} cy={g.ch / 2} r={5} className={TOOL_FILL[t.id]} />
                <text x={32} y={g.ch / 2 + 5} className={`fill-foreground font-display font-medium ${narrow ? "text-[13px]" : "text-[14px]"}`}>
                  {t.name}
                </text>
              </g>
            );
          })}
        </g>
        <g className="[transition:opacity_.7s]" style={{ opacity: step === 4 ? 1 : 0, transitionDelay: step === 4 ? ".4s" : "0s" }}>
          <line x1={cg.x0} x2={cg.x1} y1={cg.base} y2={cg.base} className="stroke-input stroke-[1.2]" />
          {g.bars.map((b, i) => (
            <g key={i}>
              <rect
                x={b.x} y={cg.base - g.pb * b.rw - 8} width={g.bw} height={g.pb * b.rw + 8} rx={6}
                className="origin-bottom fill-primary/[.14] [transform-box:fill-box]"
                style={{ transform: `scaleY(${step === 4 ? 1 : 0})`, transition: `transform .7s ${EASE}`, transitionDelay: step === 4 ? ".5s" : "0s" }}
              />
              <text x={b.bx} y={cg.base + 22} textAnchor="middle" className="fill-muted-foreground font-display text-[13px] font-medium">
                {story.chart.days[i]}
              </text>
            </g>
          ))}
        </g>
        <g>
          {g.dots.map((p, k) => {
            const o = p[step] ?? { x: 0, y: 0, o: 0 };
            const tool = tools[k % 5];
            return (
              <circle
                key={k} r={narrow ? 3.6 : 4.2} className={tool ? TOOL_FILL[tool.id] : ""}
                style={{ transform: tr(o.x, o.y), opacity: o.o, transition: `transform 1s ${EASE}, opacity .7s`, transitionDelay: `${k * 14}ms` }}
              />
            );
          })}
        </g>
      </svg>

      <div
        className="pointer-events-none absolute inset-0"
        style={{ transformOrigin: `${ox}px ${oy}px`, transform: `translate(${pose.x.toFixed(1)}px,${pose.y.toFixed(1)}px) scale(${pose.s.toFixed(4)})`, transition: `transform .9s ${EASE}` }}
      >
        {/* the block is absent at step 0 and appears in place (fade + scale about its own centre) */}
        <div
          className="absolute inset-0"
          style={{
            transformOrigin: `${ox + g.Lx}px ${oy + g.Ly}px`, opacity: step === 0 ? 0 : 1, transform: step === 0 ? "scale(.55)" : "none",
            transition: "opacity .7s ease, transform .8s cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <LogoCube
            visible={step >= 3 ? 3 : 1} open={step === 3 && go} faceDots dotsOn={step === 2}
            className="!h-full !max-w-none"
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0">
        {pillars.map((p, i) => {
          const x3 = ox + ((w * (i + 0.5)) / 3 - ox) * s3;
          return (
            <div
              key={p.n}
              className="absolute text-center leading-[1.3] [transition:opacity_.25s]"
              style={{
                left: x3 - g.lw / 2, top: g.y3 + (g.Eo * s3) / 2 + 30, width: g.lw,
                opacity: step === 3 ? 1 : 0,
                ...(step === 3 ? { transition: `opacity .6s ease ${(1.1 + i * 0.12).toFixed(2)}s` } : null),
              }}
            >
              <span className="block text-[13px] text-muted-foreground">{p.label}</span>
              <b className="mt-0.5 block font-display text-[15px] font-semibold">{p.name}</b>
            </div>
          );
        })}
        <div
          className={`absolute rounded-[16px_16px_16px_4px] border border-input bg-card font-display font-medium leading-[1.4] ${narrow ? "px-3.5 py-2.5 text-base" : "px-[18px] py-3 text-lg"}`}
          style={{
            left: cg.q.x, top: cg.q.y, maxWidth: "max-content", width: w * (narrow ? 0.62 : 0.46),
            opacity: step === 4 ? 1 : 0, transform: step === 4 ? "none" : "translateY(8px)",
            transition: step === 4 ? "opacity .6s ease .3s, transform .6s ease .3s" : "opacity .3s, transform .3s",
          }}
        >
          {story.chart.question}
        </div>
        <div
          className={`absolute rounded-[16px_16px_4px_16px] border border-accent bg-[color-mix(in_srgb,hsl(var(--accent))_14%,hsl(var(--card)))] leading-[1.4] ${narrow ? "px-3.5 py-2.5 text-[15px]" : "px-[18px] py-3 text-base"}`}
          style={{
            left: cg.a.x, top: cg.a.y, maxWidth: "max-content", width: w * (narrow ? 0.88 : 0.46),
            opacity: step === 4 ? 1 : 0, transform: step === 4 ? "none" : "translateY(8px)",
            transition: step === 4 ? "opacity .6s ease 1.7s, transform .6s ease 1.7s" : "opacity .3s, transform .3s",
          }}
        >
          <b className="font-display font-semibold">{story.chart.answerLead}</b> {story.chart.answerRest}
        </div>
      </div>
    </div>
  );
});

/** Home "How it works": five scroll-pinned steps (stacked static frames on small screens / reduced motion). */
export function ConnectStory({ story, tools, pillars }: { story: StoryContent; tools: readonly ToolItem[]; pillars: readonly PillarItem[] }) {
  const steps = useMemo(() => story.steps.map((s) => ({ label: s.label, title: s.title, emphasis: s.emphasis, description: s.description })), [story]);
  return (
    <PinnedStage
      id="how" aria-label={story.ariaLabel} railLabel={story.railLabel} steps={steps} figHeight={440}
      renderFrame={(step, size: Size) => <StageScene key={`${size.width}x${size.height}`} step={step} w={size.width} h={size.height} story={story} tools={tools} pillars={pillars} />}
    />
  );
}
