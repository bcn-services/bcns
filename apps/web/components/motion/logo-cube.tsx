"use client";

import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type ReactNode,
} from "react";
import { CUBE_SLOTS, clamp, cubeLayout, dotGrid } from "./cube-math";
import { useInView } from "./use-in-view";
import { useMediaQuery, useReducedMotion } from "./use-media-query";

/** One dot on a face grid: rows are grouped by tool colour, columns repeat it. */
export interface FaceDot { color: string }

export interface LogoCubeProps {
  /** How many blocks show. 1 = bottom-left only; 2 = bottom pair; 3 = all. Hidden blocks fade/scale in place. */
  visible?: 1 | 2 | 3;
  /** Controlled: blocks turn face-on into a row. OR-ed with the interactive state. Under prefers-reduced-motion, interactive/cards cubes are forced open and static. */
  open?: boolean;
  /** Dot grid on the bottom-left block's three faces. true = 5 rows x 4 cols in the five tool colours; or pass rows of dots. */
  faceDots?: boolean | readonly (readonly FaceDot[])[];
  /** Show/hide the face dots with a pop-in (default true while faceDots is set). */
  dotsOn?: boolean;
  /** Numerals + line icons on the front faces once open (default true). */
  faceContent?: boolean;
  /** Hover/focus opens, click/tap pins, Esc closes, touch auto-opens once at 50% in view. */
  interactive?: boolean;
  /** Pillar cards, in pillar order [left, right, top] (== left-to-right on desktop). Enables the cards layout. */
  cards?: readonly ReactNode[];
  /** Accessible name for the interactive stack. */
  ariaLabel?: string;
  /** Appended to the root. The root is `relative max-w-[70rem]`; no cards: h-[340px] (440px at >=900px). Use `!h-full !max-w-none` to fill a parent. */
  className?: string;
}

/** CSS custom properties in a style object (the one place a cast is unavoidable). */
function vars(o: Record<string, string | number>): CSSProperties {
  return o as CSSProperties; // custom properties are not in CSSProperties
}

const FILLS = [
  "hsl(var(--cube-top, 214 84% 88%))",
  "hsl(var(--cube-left, 214 88% 73%))",
  "hsl(var(--cube-right, 214 64% 57%))",
] as const;
const FACES = [
  { key: "top", rot: "rotateX(90deg)", fill: FILLS[0], drop: "b" },
  { key: "left", rot: "rotateY(-90deg)", fill: FILLS[1], drop: "tr" },
  { key: "front", rot: "rotateY(0deg)", fill: FILLS[2], drop: "" },
] as const;
const TOOL_COLORS = [
  "hsl(var(--tool-shopify, 124 20% 47%))", "hsl(var(--tool-square, 250 43% 60%))", "hsl(var(--tool-quickbooks, 173 31% 45%))",
  "hsl(var(--tool-calendar, 35 51% 50%))", "hsl(var(--tool-gmail, 5 45% 55%))",
];
const DEFAULT_DOTS: FaceDot[][] = TOOL_COLORS.map((color) => [{ color }, { color }, { color }, { color }]);

type IconEl =
  | { t: "path"; d: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx: number }
  | { t: "dot"; cx: number; cy: number; r: number };
const ICONS: IconEl[][] = [
  [
    { t: "path", d: "M7 9 L33 24" }, { t: "path", d: "M7 24 H33" }, { t: "path", d: "M7 39 L33 24" }, { t: "path", d: "M39 24 H44" },
    { t: "dot", cx: 6, cy: 9, r: 2.4 }, { t: "dot", cx: 6, cy: 24, r: 2.4 }, { t: "dot", cx: 6, cy: 39, r: 2.4 }, { t: "dot", cx: 36, cy: 24, r: 4.6 },
  ],
  [
    { t: "rect", x: 5, y: 8, w: 38, h: 32, rx: 4 }, { t: "path", d: "M5 17 H43" }, { t: "path", d: "M12 27 H26" }, { t: "path", d: "M12 33 H21" },
    { t: "rect", x: 30, y: 25, w: 7, h: 9, rx: 1.5 },
    { t: "dot", cx: 10.5, cy: 12.5, r: 1.5 }, { t: "dot", cx: 15.5, cy: 12.5, r: 1.5 }, { t: "dot", cx: 20.5, cy: 12.5, r: 1.5 },
  ],
  [
    { t: "path", d: "M7 35 A17 17 0 0 1 41 35" }, { t: "path", d: "M7 35 H41" }, { t: "path", d: "M17.5 23 L15.6 19.6" },
    { t: "path", d: "M24 20 V17" }, { t: "path", d: "M30.5 23 L32.4 19.6" }, { t: "path", d: "M24 35 L33 25" },
    { t: "dot", cx: 24, cy: 35, r: 3 },
  ],
];

const DRAW = "[stroke-dasharray:1] [stroke-dashoffset:1] [transition:stroke-dashoffset_.3s] group-data-[open=true]/cb:[stroke-dashoffset:0] group-data-[open=true]/cb:[transition:stroke-dashoffset_.8s_ease_calc(.9s_+_var(--i)*.09s)]";
const SOLID = "stroke-none opacity-0 [transition:opacity_.2s] group-data-[open=true]/cb:opacity-100 group-data-[open=true]/cb:[transition:opacity_.4s_ease_calc(1.1s_+_var(--i)*.09s)]";

function FaceContent({ pillar }: { pillar: number }) {
  return (
    <div className="absolute inset-0 text-white opacity-0 [transition:opacity_.2s] group-data-[open=true]/cb:opacity-100 group-data-[open=true]/cb:[transition:opacity_.4s_ease_calc(.82s_+_var(--i)*.09s)]">
      <span className="absolute left-[11%] top-[8%] font-display text-[length:calc(var(--E)*.27)] font-bold leading-none tracking-[-.02em]">
        {`0${pillar + 1}`}
      </span>
      <svg viewBox="0 0 48 48" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute bottom-[9%] right-[9%] h-[46%] w-[46%] overflow-visible">
        {(ICONS[pillar] ?? []).map((el, i) =>
          el.t === "path" ? <path key={i} d={el.d} pathLength={1} className={DRAW} />
          : el.t === "rect" ? <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} pathLength={1} className={DRAW} />
          : <circle key={i} cx={el.cx} cy={el.cy} r={el.r} fill="#fff" className={SOLID} />,
        )}
      </svg>
    </div>
  );
}

const EDGE_SIDE = {
  t: "left-0 top-0 h-[var(--bw)] w-full", b: "bottom-0 left-0 h-[var(--bw)] w-full",
  l: "left-0 top-0 h-full w-[var(--bw)]", r: "right-0 top-0 h-full w-[var(--bw)]",
} as const;

export function LogoCube({
  visible = 3, open = false, faceDots, dotsOn = true, faceContent = true, interactive = false,
  cards, ariaLabel = "The bcns logo. Open to see more.", className = "",
}: LogoCubeProps) {
  const hasCards = !!cards && cards.length > 0;
  const boxRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cubeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRefs = useRef<(HTMLElement | null)[]>([]);
  const liRefs = useRef<(HTMLLIElement | null)[]>([]);
  const reduced = useReducedMotion();
  const touch = useMediaQuery("(hover: none)");

  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const isOpen = (reduced && (interactive || hasCards)) || open || (interactive && (hover || focus || pinned));

  // Esc closes a hover/focus/pinned cube wherever focus is (the box's own onKeyDown only hears it when focus is inside)
  const engaged = interactive && (hover || focus || pinned);
  useEffect(() => {
    if (!engaged) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPinned(false); setFocus(false); setHover(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [engaged]);

  // touch: auto-open once when half in view
  const seen = useInView(boxRef, { threshold: 0.5, once: true, enabled: interactive && touch && !reduced });
  useEffect(() => { if (seen) setPinned(true); }, [seen]);

  // measure + write layout vars straight to the DOM (no re-render, transitions suppressed for the jump)
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const wideMq = window.matchMedia("(min-width: 900px)");
    let raf = 0;
    let lastW = 0;
    const apply = () => {
      const wide = wideMq.matches;
      const sr = box.getBoundingClientRect();
      const cardCenters = hasCards && wide
        ? liRefs.current.map((li) => { const r = li?.getBoundingClientRect(); return r ? r.left - sr.left + r.width / 2 : 0; })
        : undefined;
      const L = cubeLayout({ W: box.clientWidth, H: box.clientHeight, wide, withCards: hasCards, cardCenters });
      if (!L) return;
      box.style.setProperty("--E", `${L.E.toFixed(2)}px`);
      box.style.setProperty("--bw", `${L.bw.toFixed(2)}px`);
      if (hasCards && !wide) {
        box.style.setProperty("--zc", `${L.zc.toFixed(0)}px`);
        box.style.setProperty("--zo", `${L.zo.toFixed(0)}px`);
      }
      L.cubes.forEach((c, i) => {
        const s = cubeRefs.current[i]?.style;
        if (s) {
          s.setProperty("--x0", `${c.x0.toFixed(1)}px`); s.setProperty("--y0", `${c.y0.toFixed(1)}px`);
          s.setProperty("--tx", `${c.tx.toFixed(1)}px`); s.setProperty("--ty", `${c.ty.toFixed(1)}px`);
          s.setProperty("--gx", `${c.gx.toFixed(1)}px`); s.setProperty("--gy", `${c.gy.toFixed(1)}px`); s.setProperty("--gs", c.gs.toFixed(4));
        }
        const sh = shadowRefs.current[i]?.style;
        if (sh) { sh.width = `${c.shadow.width}px`; sh.left = `${c.shadow.left}px`; sh.top = `${c.shadow.top}px`; }
      });
    };
    const instant = () => {
      box.setAttribute("data-nt", "");
      apply();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => box.removeAttribute("data-nt")); });
    };
    instant();
    // the phone layout depends on width only; skipping height-only changes keeps the zone/card transitions from being cut short
    const ro = new ResizeObserver(() => {
      const w = box.clientWidth;
      if (hasCards && !wideMq.matches && w === lastW) return;
      lastW = w;
      instant();
    });
    ro.observe(box);
    if (document.fonts?.ready) void document.fonts.ready.then(instant);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [hasCards]);

  // pointer parallax (mouse only, interactive only)
  const aim = useRef({ tx: 0, ty: 0, cx: 0, cy: 0, raf: 0 });
  useEffect(() => () => cancelAnimationFrame(aim.current.raf), []);
  const tick = useCallback(() => {
    const a = aim.current;
    a.cx += (a.tx - a.cx) * 0.09; a.cy += (a.ty - a.cy) * 0.09;
    if (layerRef.current) layerRef.current.style.transform = `rotateX(${(-a.cy * 4.5).toFixed(3)}deg) rotateY(${(a.cx * 5.5).toFixed(3)}deg)`;
    boxRef.current?.style.setProperty("--mx", a.cx.toFixed(3));
    a.raf = Math.abs(a.tx - a.cx) > 0.002 || Math.abs(a.ty - a.cy) > 0.002 ? requestAnimationFrame(tick) : 0;
  }, []);
  const steer = (x: number, y: number) => {
    aim.current.tx = x; aim.current.ty = y;
    if (!aim.current.raf && !reduced) aim.current.raf = requestAnimationFrame(tick);
  };

  const shown = [visible >= 3, true, visible >= 2]; // top, bottom-left, bottom-right
  const grid = faceDots === undefined || faceDots === false ? null : faceDots === true ? DEFAULT_DOTS : faceDots;

  const handlers = interactive
    ? {
        onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType !== "touch") setHover(true); },
        onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType !== "touch") { setHover(false); steer(0, 0); } },
        onPointerMove: (e: React.PointerEvent) => {
          if (e.pointerType === "touch" || !boxRef.current) return;
          const r = boxRef.current.getBoundingClientRect();
          steer(clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1), clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1));
        },
        onClick: (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest("a")) return; setPinned((p) => !p); }, // closest() needs an Element; click targets are
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") { setPinned(false); setFocus(false); setHover(false); } },
        onFocus: (e: React.FocusEvent) => { if (e.target.matches(":focus-visible")) setFocus(true); },
        onBlur: (e: React.FocusEvent) => { if (!boxRef.current?.contains(e.relatedTarget)) setFocus(false); },
      }
    : {};

  const root = [
    "group/cb relative mx-auto max-w-[70rem] [--E:160px] [--bw:2px]",
    "[&[data-nt]]:!transition-none [&[data-nt]_*]:!transition-none [&[data-rm=true]]:!transition-none [&[data-rm=true]_*]:!transition-none",
    hasCards
      ? "max-[899px]:max-w-[40rem] max-[899px]:pb-2 max-[899px]:pt-[var(--zc,270px)] max-[899px]:[transition:padding-top_.6s_cubic-bezier(.4,0,.2,1)_.34s] max-[899px]:data-[open=true]:pt-[var(--zo,150px)] min-[900px]:min-h-[660px] min-[900px]:pb-2 min-[900px]:pt-[268px]"
      : "h-[340px] min-[900px]:h-[440px]",
    className,
  ].join(" ");

  const stackBase = "absolute inset-0 z-[3] cursor-pointer rounded-2xl outline-none [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  const stackOpen = hasCards
    ? "max-[899px]:bottom-auto max-[899px]:h-[var(--zc,270px)] max-[899px]:[transition:height_.6s_cubic-bezier(.4,0,.2,1)_.34s] max-[899px]:group-data-[open=true]/cb:h-[var(--zo,150px)] min-[900px]:group-data-[open=true]/cb:pointer-events-none min-[900px]:group-data-[open=true]/cb:cursor-default"
    : "group-data-[open=true]/cb:pointer-events-none group-data-[open=true]/cb:cursor-default";

  return (
    <div ref={boxRef} className={root} data-open={isOpen ? "true" : "false"} data-rm={reduced ? "true" : "false"} {...handlers}>
      {interactive ? (
        <div
          role="button" tabIndex={0} aria-expanded={isOpen} aria-label={ariaLabel} className={`${stackBase} ${stackOpen}`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPinned((p) => !p); } }}
        />
      ) : null}

      {/* ground shadows */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {CUBE_SLOTS.map((c, i) => (
          <i
            key={c.pillar} ref={(el) => { shadowRefs.current[i] = el; }} style={vars({ "--i": c.pillar })}
            className="pointer-events-none absolute h-[18px] scale-[.2] rounded-full bg-[radial-gradient(closest-side,rgba(47,52,64,.34),transparent)] opacity-0 [transition:opacity_.3s,transform_.3s] group-data-[open=true]/cb:scale-100 group-data-[open=true]/cb:opacity-100 group-data-[open=true]/cb:[transition:opacity_.6s_ease_calc(.12s_+_var(--i)*.09s),transform_.9s_cubic-bezier(.16,1,.3,1)_calc(.12s_+_var(--i)*.09s)] dark:bg-[radial-gradient(closest-side,rgba(0,0,0,.55),transparent)]"
          />
        ))}
      </div>

      <div ref={layerRef} aria-hidden="true" className="absolute inset-0 [transform-style:preserve-3d]">
        {CUBE_SLOTS.map((c, i) => (
          <div
            key={c.pillar} ref={(el) => { cubeRefs.current[i] = el; }}
            style={{ ...vars({ "--i": c.pillar }), transitionDelay: visible === 3 && i !== 1 ? `${i === 0 ? 0.1 : 0.3}s` : "0s" }}
            className={`absolute left-[calc(var(--x0)_-_var(--E)_/_2)] top-[calc(var(--y0)_-_var(--E)_/_2)] h-[var(--E)] w-[var(--E)] [transform-style:preserve-3d] [transition:opacity_.7s_ease,transform_.8s_cubic-bezier(.2,.8,.2,1)] ${shown[i] ? "" : "scale-[.6] opacity-0"}`}
          >
            <div className="absolute inset-0 [transform-style:preserve-3d] [transition:transform_.34s_cubic-bezier(.4,0,.2,1)_.5s] group-data-[open=true]/cb:[transform:translate(var(--tx),var(--ty))] group-data-[open=true]/cb:[transition-delay:0s]">
              <div className="absolute inset-0 [transform-style:preserve-3d] [transition:transform_.7s_cubic-bezier(.4,0,.2,1)_0s] group-data-[open=true]/cb:[transform:translate(var(--gx),var(--gy))_scale(var(--gs))] group-data-[open=true]/cb:[transition-delay:calc(.34s_+_var(--i)*.09s)]">
                <div className="absolute inset-0 [transform-style:preserve-3d] [transform:rotateX(-35.264deg)_rotateY(45deg)] [transition:transform_.62s_cubic-bezier(.4,0,.2,1)_0s] group-data-[open=true]/cb:[transform:rotateX(-5deg)_rotateY(6.5deg)] group-data-[open=true]/cb:[transition-delay:calc(.34s_+_var(--i)*.09s)]">
                  {FACES.map((f, fi) => (
                    <div
                      key={f.key} style={vars({ "--r": f.rot })}
                      className="absolute inset-0 [backface-visibility:hidden] [transform:var(--r)_translateZ(calc(var(--E)_/_2))]"
                    >
                      <div className="absolute inset-0" style={{ background: f.fill }} />
                      {(["t", "r", "b", "l"] as const).filter((s) => !f.drop.includes(s)).map((s) => (
                        <i key={s} className={`absolute bg-foreground/85 dark:bg-transparent ${EDGE_SIDE[s]}`} />
                      ))}
                      {f.key === "front" ? (
                        <div className="absolute inset-0 opacity-0 [background:linear-gradient(calc(150deg_+_var(--mx,0)*35deg),rgba(255,255,255,.3),rgba(255,255,255,0)_62%)] [transition:opacity_.3s] group-data-[open=true]/cb:opacity-100 group-data-[open=true]/cb:[transition:opacity_.62s_ease_calc(.34s_+_var(--i)*.09s)]" />
                      ) : (
                        <div
                          className={`absolute inset-0 bg-[#14315c] opacity-0 [transition:opacity_.3s] group-data-[open=true]/cb:[transition:opacity_.62s_ease_calc(.34s_+_var(--i)*.09s)] ${f.key === "left" ? "group-data-[open=true]/cb:opacity-[.22]" : "group-data-[open=true]/cb:opacity-[.12]"}`}
                        />
                      )}
                      {f.key === "front" && faceContent && !(grid && dotsOn) && <FaceContent pillar={c.pillar} />}
                      {i === 1 && grid && (
                        <div className="absolute inset-0">
                          {dotGrid(grid.length, grid[0]?.length ?? 0, fi).map((d) => (
                            <i
                              key={`${d.row}-${d.col}`}
                              style={vars({ "--x": `${d.x}%`, "--y": `${d.y}%`, "--dc": grid[d.row]?.[d.col]?.color ?? "transparent", "--d": `${d.delay}s` })}
                              className={`absolute left-[var(--x)] top-[var(--y)] h-[calc(var(--E)*.1)] w-[calc(var(--E)*.1)] rounded-full bg-[var(--dc)] [margin:calc(var(--E)*-.05)_0_0_calc(var(--E)*-.05)] [box-shadow:0_0_0_calc(var(--E)*.014)_rgba(255,255,255,.92)] ${
                                dotsOn
                                  ? "scale-100 opacity-100 [transition:opacity_.5s_ease_var(--d),transform_.5s_cubic-bezier(.2,.9,.3,1.3)_var(--d)]"
                                  : "scale-[.3] opacity-0 [transition:opacity_.35s_ease,transform_.35s_ease]"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {interactive && !reduced && (
        <p
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-5 z-[1] text-center font-display text-[13px] font-medium uppercase tracking-[.16em] text-muted-foreground transition-opacity duration-300 before:mr-[10px] before:inline-block before:h-[7px] before:w-[7px] before:rounded-full before:bg-primary before:align-[1px] before:content-[''] before:animate-pulse group-data-[open=true]/cb:opacity-0 ${hasCards ? "max-[899px]:bottom-auto max-[899px]:top-[calc(var(--zc,270px)_-_36px)]" : ""}`}
        >
          <span className="[@media(hover:none)]:hidden">Hover to open</span>
          <span className="[@media(hover:hover)]:hidden">Tap to open</span>
        </p>
      )}

      {hasCards && (
        <ul
          className="relative z-[2] grid gap-4 max-[899px]:max-h-0 max-[899px]:overflow-hidden max-[899px]:py-1 max-[899px]:[transition:max-height_.4s_ease] max-[899px]:group-data-[open=true]/cb:max-h-[1600px] max-[899px]:group-data-[open=true]/cb:[transition:max-height_.8s_ease_.3s] min-[900px]:grid-cols-3 min-[900px]:gap-6"
        >
          {cards.map((card, i) => (
            <li
              key={i} ref={(el) => { liRefs.current[i] = el; }} style={vars({ "--c": i })}
              className="invisible min-w-0 -translate-y-[26px] opacity-0 [transition:opacity_.25s,transform_.3s,visibility_0s_.3s] group-data-[open=true]/cb:visible group-data-[open=true]/cb:translate-y-0 group-data-[open=true]/cb:opacity-100 group-data-[open=true]/cb:[transition:opacity_.5s_ease_calc(.9s_+_var(--c)*.1s),transform_.7s_cubic-bezier(.16,1,.3,1)_calc(.9s_+_var(--c)*.1s),visibility_0s_0s] [&>*]:h-full"
            >
              {card}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
