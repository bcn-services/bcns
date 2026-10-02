import type { CSSProperties, ReactNode } from "react";

/**
 * The three small illustrations on the AI-day timeline, all 240x150 with no
 * text inside. Each part carries `t` (0..1): it builds in once its stop is
 * visible, staggered by that value. Everything animates through CSS transitions.
 */

type From = "sc" | "L" | "R" | "B" | "prog" | "none";

const FROM: Record<From, string> = {
  sc: "scale-[0.3]",
  L: "-translate-x-[34px] translate-y-2",
  R: "translate-x-[34px] -translate-y-2.5",
  B: "translate-y-[26px]",
  prog: "scale-x-0",
  none: "",
};
const SETTLED: Record<From, string> = {
  sc: "scale-100",
  L: "translate-x-0 translate-y-0",
  R: "translate-x-0 translate-y-0",
  B: "translate-y-0",
  prog: "scale-x-100",
  none: "",
};
const TRANSITION: Record<From, string> = {
  prog: "[transition:transform_1.1s_ease-out]",
  none: "[transition:opacity_.5s]",
  sc: "[transition:opacity_.5s,transform_.7s_cubic-bezier(.34,1.4,.5,1)]",
  L: "[transition:opacity_.5s,transform_.7s_cubic-bezier(.34,1.4,.5,1)]",
  R: "[transition:opacity_.5s,transform_.7s_cubic-bezier(.34,1.4,.5,1)]",
  B: "[transition:opacity_.5s,transform_.7s_cubic-bezier(.34,1.4,.5,1)]",
};

function Part({
  t,
  from,
  on,
  className = "",
  children,
}: {
  t: number;
  from: From;
  on: boolean;
  className?: string;
  children: ReactNode;
}) {
  const fades = from !== "prog";
  return (
    <g
      style={{ transitionDelay: on ? `${(t * 0.8 + 0.15).toFixed(2)}s` : "0s" }}
      className={`[transform-box:fill-box] ${from === "prog" ? "origin-left" : "origin-center"} motion-reduce:!transition-none ${TRANSITION[from]} ${
        fades && !on ? "opacity-0" : ""
      } ${on ? SETTLED[from] : FROM[from]} ${on ? className : ""}`}
    >
      {children}
    </g>
  );
}

const ROW = "fill-secondary stroke-border";
const BAR = "fill-border";
const HOT =
  "fill-[color-mix(in_srgb,hsl(var(--primary))_14%,hsl(var(--card)))] stroke-primary stroke-[1.5px]";
const STROKE = "fill-none stroke-primary stroke-2 [stroke-linecap:round] [stroke-linejoin:round]";
const OK = "fill-tool-shopify";
const OK_CHECK = "fill-none stroke-white stroke-2 [stroke-linecap:round] [stroke-linejoin:round]";

function Find({ on }: { on: boolean }) {
  return (
    <>
      {[0, 1, 2, 3].map((r) => {
        const y = 14 + r * 32;
        const hot = r === 2;
        return (
          <Part key={r} t={0.02 + r * 0.06} from="B" on={on}>
            <rect className={ROW} x="14" y={y} width="212" height="24" rx="7" />
            <circle className={BAR} cx="29" cy={y + 12} r="5" />
            <rect className={BAR} x="43" y={y + 9} width={hot ? 40 : 56 + r * 12} height="6" rx="3" />
            {!hot && <rect className={BAR} x={110 + r * 8} y={y + 9} width="40" height="6" rx="3" />}
          </Part>
        );
      })}
      <Part t={0.45} from="sc" on={on}>
        <rect className={HOT} x="14" y="78" width="212" height="24" rx="7" />
        <rect className="fill-tool-calendar opacity-90" x="90" y="87" width="104" height="6" rx="3" />
        <circle className="fill-primary" cx="29" cy="90" r="5" />
      </Part>
      <Part t={0.5} from="none" on={on} className="motion-safe:animate-pulse [animation-duration:2.2s]">
        <rect className="fill-none stroke-primary stroke-[1.5px]" x="12" y="76" width="216" height="28" rx="9" />
      </Part>
      <Part t={0.3} from="sc" on={on}>
        <circle className={STROKE} cx="204" cy="60" r="11" />
        <path className={STROKE} d="M212 68 L221 77" />
      </Part>
    </>
  );
}

function Build({ on }: { on: boolean }) {
  return (
    <>
      <rect x="14" y="12" width="212" height="126" rx="9" className="fill-none stroke-input" strokeDasharray="4 4" />
      <Part t={0.1} from="L" on={on}>
        <rect className={ROW} x="22" y="20" width="196" height="20" rx="6" />
        <circle className="fill-primary" cx="34" cy="30" r="4" />
        <rect className={BAR} x="46" y="27" width="60" height="6" rx="3" />
      </Part>
      {[
        { t: 0.3, from: "L" as const, x: 22, w: 38 },
        { t: 0.5, from: "R" as const, x: 90, w: 28 },
        { t: 0.65, from: "R" as const, x: 158, w: 40 },
      ].map(({ t, from, x, w }) => (
        <Part key={x} t={t} from={from} on={on}>
          <rect className={ROW} x={x} y="48" width="60" height="42" rx="7" />
          <rect className={BAR} x={x + 10} y="58" width="24" height="5" rx="2.5" />
          <rect className="fill-primary" x={x + 10} y="70" width={w} height="9" rx="4.5" />
        </Part>
      ))}
      <Part t={0.8} from="B" on={on}>
        <rect className={HOT} x="22" y="98" width="196" height="30" rx="7" />
        <rect className={BAR} x="34" y="109" width="90" height="6" rx="3" />
        <rect className={BAR} x="34" y="119" width="54" height="5" rx="2.5" />
        <circle className={OK} cx="198" cy="113" r="8" />
        <path className={OK_CHECK} d="M193.5 113 L197 116.5 L202.5 110" />
      </Part>
    </>
  );
}

function Team({ on }: { on: boolean }) {
  return (
    <>
      {[0, 1, 2].map((k) => {
        const x = 44 + k * 76;
        const t = 0.1 + k * 0.25;
        return (
          <g key={k}>
            <Part t={t} from="sc" on={on}>
              <circle className="fill-accent" cx={x} cy="44" r="14" />
              <path className="fill-accent opacity-[.55]" d={`M${x - 24} 90 C ${x - 24} 64 ${x + 24} 64 ${x + 24} 90 Z`} />
            </Part>
            <Part t={t + 0.12} from="sc" on={on}>
              <circle className={OK} cx={x + 16} cy="62" r="9" />
              <path className={OK_CHECK} d={`M${x + 11.5} 62 L${x + 15} 65.5 L${x + 20.5} 59`} />
            </Part>
            <rect className={BAR} x={x - 26} y="106" width="52" height="7" rx="3.5" />
            <Part t={t + 0.05} from="prog" on={on}>
              <rect className="fill-primary" x={x - 26} y="106" width="52" height="7" rx="3.5" />
            </Part>
            <rect className={BAR} x={x - 26} y="120" width="34" height="6" rx="3" />
          </g>
        );
      })}
    </>
  );
}

const SCENES = [Find, Build, Team];

/** One stop's illustration in its card; fades and lifts in when `visible`, building its parts. */
export function AiIllustration({
  index,
  visible,
  className = "",
  style,
}: {
  index: number;
  visible: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const Scene = SCENES[index];
  if (!Scene) return null;
  return (
    <div
      style={style}
      className={`${className} rounded-[0.875rem] border border-border bg-card shadow-[0_10px_28px_hsl(var(--primary)/0.16)] [transition:opacity_.5s,transform_.6s] motion-reduce:!transition-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2.5 opacity-0"
      }`}
    >
      <svg viewBox="0 0 240 150" aria-hidden className="block size-full">
        <Scene on={visible} />
      </svg>
    </div>
  );
}
