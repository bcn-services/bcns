"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { FACE_FILLS, LOGO_CUBES } from "@/components/cube";
import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { FlowDots, useElementSize, useInView, useReducedMotion } from "@/components/motion";
import type { AiConsultContent, ConnectDemoContent, ToolId, ToolItem } from "@/lib/content";
import { connectGeo, type Pt } from "./connect-geo";

/**
 * /services/connect: a stage that plays once when ~40% in view (about 6s), then
 * rests on its final frame with a "Play again" button. Beside it the three
 * steps, the current one marked. One persistent set of SVG pieces; the phase
 * only changes their transforms, so CSS transitions do the motion.
 *
 * Phases: 0 scrambled tools connected, 1 cube appears, 2 dots sort into rows,
 * 3 outputs appear.
 */
type Phase = 0 | 1 | 2 | 3;

const FILL: Record<ToolId, string> = {
  shopify: "fill-tool-shopify", square: "fill-tool-square", quickbooks: "fill-tool-quickbooks",
  calendar: "fill-tool-calendar", gmail: "fill-tool-gmail",
};
const MOVE = "[transform-box:fill-box] [transform-origin:center] [transition:transform_.8s_cubic-bezier(.4,0,.2,1),opacity_.8s]";
const MOVE_DOT = "[transform-box:fill-box] [transform-origin:center] [transition:transform_.9s_cubic-bezier(.4,0,.2,1),opacity_.5s]";
const TEXT = "fill-foreground font-display text-[13px] font-medium";
const SUB = "fill-muted-foreground text-[12px] font-normal";
const at = (a: readonly (readonly number[])[], i: number): Pt => [a[i]?.[0] ?? 0, a[i]?.[1] ?? 0];
const move = (x: number, y: number, extra = "") => `translate(${x}px,${y}px)${extra}`;

interface StageData { tools: readonly ToolItem[]; connectDemo: ConnectDemoContent }

function Diagram({ w, h, phase, instant, tools, connectDemo }: { w: number; h: number; phase: Phase; instant: boolean } & StageData) {
  const { rows, destinations } = connectDemo;
  const g = connectGeo(w, h);
  const s = phase === 0 ? 0 : phase < 3 ? 1 : 2; // scrambled / sorting / put to work
  const cc: Pt = [g.cx, g.cy];
  const primary = "hsl(var(--primary))";
  const toolColor = (i: number) => `hsl(var(--tool-${tools[i]?.id ?? "shopify"}))`;

  const flowA = tools.map((_, i) => {
    const [sx, sy] = [at(g.scr, i)[0] + g.cw / 2, at(g.scr, i)[1] + g.ch / 2];
    return `M${sx} ${sy} Q ${(sx + cc[0]) / 2} ${sy + 30} ${cc[0]} ${cc[1]}`;
  });
  const flowB = tools.map((_, i) => {
    const t = at(g.tool, i);
    const tx = t[0] + (g.land ? g.cw : g.cw / 2);
    const ty = t[1] + (g.land ? g.ch / 2 : g.ch);
    return g.land
      ? `M${tx} ${ty} C ${tx + 50} ${ty} ${cc[0] - g.cs / 2 - 40} ${cc[1]} ${cc[0] - g.cs / 2 + 6} ${cc[1]}`
      : `M${tx} ${ty} C ${tx} ${ty + 30} ${cc[0]} ${cc[1] - g.cs / 2 - 30} ${cc[0]} ${cc[1] - g.cs / 2 + 8}`;
  });
  const flowC = destinations.map((_, i) => {
    const d = at(g.dest, i);
    if (g.land) {
      const ey = d[1] + g.dh / 2;
      return `M${cc[0] + g.cs / 2 - 6} ${cc[1]} C ${cc[0] + g.cs / 2 + 40} ${cc[1]} ${d[0] - 40} ${ey} ${d[0]} ${ey}`;
    }
    const ex = d[0] + g.dw / 2;
    return `M${cc[0]} ${cc[1] + g.cs / 2 - 8} C ${cc[0]} ${cc[1] + g.cs / 2 + 14} ${ex} ${d[1] - 16} ${ex} ${d[1]}`;
  });

  const dots = Array.from({ length: 30 }, (_, k) => {
    const rr = Math.floor(k / 6), jj = k % 6, ci = (jj + rr * 2) % 5;
    let x: number, y: number, sc = 1, o = 1;
    if (phase === 0) {
      const lp = g.loose[k]; // clear of every scrambled card; unplaced dots stay hidden
      x = lp?.[0] ?? g.cx; y = lp?.[1] ?? g.cy; o = lp ? 1 : 0;
    } else if (phase === 1) {
      x = g.cx + ((k * 7) % 11) - 5; y = g.cy + ((k * 5) % 11) - 5; sc = 0.5; o = 0;
    } else if (phase === 2) {
      const lw = g.land ? 84 : 70;
      const r = at(g.row, rr);
      x = r[0] + lw + jj * (g.land ? 15 : Math.max(12, (g.rw - lw - 10) / 6));
      y = r[1];
    } else {
      const d = at(g.dest, Math.floor(k / 10));
      const gx = Math.min(12, (g.dw - (g.land ? 28 : 20)) / 9);
      x = d[0] + (g.land ? 16 : 10) + (k % 10) * gx;
      y = d[1] + g.dh - 14;
    }
    return { k, ci, x, y, sc, o, delay: jj * 0.04 + rr * 0.02 };
  });

  const flowGroup = (on: boolean): CSSProperties => ({ opacity: on ? 1 : 0 });
  const flowCls = `${MOVE}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      className={`absolute inset-0 block h-full w-full ${instant ? "[&_*]:!transition-none" : ""}`}
    >
      {/* connectors: scrambled tools to the empty target, tidy tools to the cube, cube to the three outputs */}
      <circle
        cx={cc[0]} cy={cc[1]} r={g.cs * 0.42} fill="none" strokeWidth={1.5} strokeDasharray="4 5"
        className={`stroke-primary ${MOVE}`} style={flowGroup(s === 0)}
      />
      {flowA.map((d, i) => (
        <g key={`a${i}`} className={flowCls} style={flowGroup(s === 0)}><FlowDots d={d} color={toolColor(i)} n={3} r={3} period={3.2} active={s === 0} /></g>
      ))}
      {flowB.map((d, i) => (
        <g key={`b${i}`} className={flowCls} style={flowGroup(s !== 0)}><FlowDots d={d} color={toolColor(i)} n={3} r={3} period={3.2} active={s !== 0} /></g>
      ))}
      {flowC.map((d, i) => (
        <g key={`c${i}`} className={flowCls} style={flowGroup(s === 2)}><FlowDots d={d} color={primary} n={g.land ? 3 : 2} r={3} period={3.2} active={s === 2} /></g>
      ))}

      {/* output cards */}
      {destinations.map((d, i) => {
        const p = at(g.dest, i);
        return (
          <g key={d.title} className={MOVE} style={{ transform: move(p[0], p[1], ` scale(${s === 2 ? 1 : 0.94})`), opacity: s === 2 ? 1 : 0 }}>
            <rect width={g.dw} height={g.dh} rx={12} strokeWidth={1.2} className="fill-card stroke-input" />
            <text x={g.land ? 14 : 10} y={g.land ? 26 : 23} className={`${TEXT} ${g.land ? "text-[15px] font-semibold" : "font-semibold"}`}>{d.title}</text>
            <text x={g.land ? 14 : 10} y={g.land ? 45 : 40} className={SUB}>{g.land ? d.line : d.short}</text>
          </g>
        );
      })}

      {/* tool cards */}
      {tools.map((t, i) => {
        const p = s === 0 ? at(g.scr, i) : at(g.tool, i);
        const rot = s === 0 ? (g.scr[i]?.[2] ?? 0) : 0;
        return (
          <g key={t.id} className={MOVE} style={{ transform: move(p[0], p[1], ` rotate(${rot}deg)`), opacity: s === 2 ? 0.6 : 1 }}>
            <rect width={g.cw} height={g.ch} rx={10} strokeWidth={1.2} className="fill-card stroke-input" />
            <circle cx={16} cy={g.ch / 2} r={5} className={FILL[t.id]} />
            <text x={30} y={g.ch / 2 + 4.5} className={TEXT}>{t.short}</text>
          </g>
        );
      })}

      {/* sorted-row labels + hairlines */}
      {rows.map((label, i) => {
        const p = at(g.row, i);
        return (
          <g key={label} className={MOVE} style={{ transform: move(p[0], p[1] - g.rh / 2), opacity: phase === 2 ? 1 : 0 }}>
            <text x={0} y={4.5} className={TEXT}>{label}</text>
            <line x1={0} x2={g.rw} y1={g.rh / 2} y2={g.rh / 2} strokeWidth={1} className="stroke-border" />
          </g>
        );
      })}

      {/* the cube appears in place */}
      <g className={MOVE} style={{ opacity: s === 0 ? 0 : 1, transform: s === 0 ? "scale(.5)" : "none" }}>
        <svg x={g.cx - g.cs / 2} y={g.cy - g.cs / 2} width={g.cs} height={g.cs * 1.0114} viewBox="44 -10.5 132 133.5">
          <g stroke="hsl(var(--foreground))" strokeWidth={2.5} strokeLinejoin="round">
            {LOGO_CUBES.map((faces, i) => (
              <g key={i}>{faces.map((d, j) => <path key={j} d={d} fill={FACE_FILLS[j]} />)}</g>
            ))}
          </g>
        </svg>
      </g>

      {/* 30 dots: scattered by their tool, packed into the cube, sorted into rows, then spread into the outputs */}
      {dots.map((d) => (
        <circle
          key={d.k} r={3.6} className={`${FILL[tools[d.ci]?.id ?? "shopify"]} ${MOVE_DOT}`}
          style={{ transform: move(d.x, d.y, ` scale(${d.sc})`), opacity: d.o, transitionDelay: `${d.delay}s` }}
        />
      ))}
    </svg>
  );
}

export function ConnectStage({ connect, connectDemo, tools }: { connect: AiConsultContent; connectDemo: ConnectDemoContent; tools: readonly ToolItem[] }) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(panelRef);
  const [phase, setPhase] = useState<Phase>(0);
  const [step, setStep] = useState(-1);
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const [instant, setInstant] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
    setStatus("playing"); setInstant(true); setPhase(0); setStep(0);
    // two frames with transitions off, so replaying snaps back to the start instead of animating in reverse
    requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
    at(1900, () => { setStep(1); setPhase(1); });
    at(2900, () => setPhase(2));
    at(4500, () => { setStep(2); setPhase(3); });
    at(6000, () => setStatus("done"));
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const seen = useInView(panelRef, { threshold: 0.4, once: true, enabled: !reduced });
  useEffect(() => { if (seen) play(); }, [seen, play]);

  // reduced motion: the final frame, nothing plays
  const shownPhase: Phase = reduced ? 3 : phase;
  const shownStep = reduced ? 2 : step;
  const shownStatus = reduced ? "idle" : status;

  return (
    <section
      id="how" aria-label={connectDemo.stageLabel}
      className={`${GUTTER} grid gap-8 pb-[4.5rem] pt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-14 lg:pb-[6.5rem] lg:pt-14`}
    >
      <div className="min-w-0">
        <div
          ref={panelRef} role="img" aria-label={connectDemo.diagramLabel}
          className="relative h-[460px] w-full overflow-hidden rounded-[20px] border border-border bg-secondary min-[600px]:h-[400px] min-[1024px]:h-[540px]"
        >
          {size.width >= 100 && size.height >= 100 && (
            <Diagram key={`${size.width}x${size.height}`} w={size.width} h={size.height} phase={shownPhase} instant={instant} tools={tools} connectDemo={connectDemo} />
          )}
        </div>
        {/* The row is always reserved so the page never jumps when the button arrives. */}
        <div className="mt-3.5 flex min-h-[44px] justify-end motion-reduce:hidden">
          <button
            type="button" onClick={play}
            className={`min-h-[44px] rounded-lg border border-input bg-transparent px-4 text-sm font-medium text-foreground transition-[opacity,border-color,background-color] duration-[400ms] hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              shownStatus === "done" ? "visible opacity-100" : "invisible opacity-0"
            }`}
          >
            {connectDemo.replayLabel}
          </button>
        </div>
      </div>

      <ol>
        {connect.steps.map((st, i) => {
          const on = shownStep === i;
          return (
            <li
              key={st.step}
              className={`mb-[1.625rem] border-l-[3px] py-1 pl-[1.375rem] transition-[border-color,opacity] duration-[400ms] last:mb-0 motion-reduce:transition-none ${
                on ? "border-l-primary" : "border-l-border"
              } ${shownStatus === "playing" && !on ? "opacity-[.45]" : ""}`}
            >
              <Eyebrow className="!text-primary-ink">{connectDemo.stepLabels[i]}</Eyebrow>
              <h2 className="mt-2 text-balance font-display text-[clamp(1.45rem,2.4vw,1.85rem)] font-light leading-[1.15] tracking-[-0.02em]">
                {emphasize(st.title, connectDemo.stepEmphasis[i] ?? "")}
              </h2>
              <p className="mt-2.5 max-w-[30rem] text-base leading-relaxed text-muted-foreground">{st.description}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
