"use client";

/**
 * Hero centrepiece: the logo's three cubes at hero scale, as one object.
 *
 * These are real cubes, not a drawing of cubes. Each is three face divs in a
 * `preserve-3d` box, and the isometric look of the logo is just the rest
 * orientation: `rotateX(-35.264deg) rotateY(45deg)` under no perspective is the
 * exact true-isometric projection, so at rest the stack reproduces the logo
 * artwork edge for edge. Because it is a real object, hovering can simply turn
 * it: the cubes break apart along their isometric axes and rotate to nearly
 * face-on, which brings the front face square to the viewer and makes the proof
 * point painted on it plain text at a plain angle instead of skewed lettering.
 *
 * Only three faces are ever built. The rest and open orientations, and every
 * angle between them (including the pointer parallax), keep the same three
 * faces toward the camera, so the other three would never render.
 *
 * Under `prefers-reduced-motion` nothing moves: no entrance, no bob, no
 * parallax, and the open state swaps in instantly on hover or focus.
 */

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { siteContent } from "@/lib/content";
import { FACE_FILLS } from "@/components/cube";

/**
 * All sizes are `cqw` — percent of the stack's own width — so the geometry is
 * resolution-independent without a single measured pixel. The stack is a
 * container (`container-type: inline-size`) for exactly this reason.
 *
 * The logo is drawn in path units where a cube is 64 wide by 74 tall and the
 * cluster's content box is 128 × 129.5, so one path unit is 100/128 cqw. A true
 * isometric projection foreshortens every edge by cos(35.264°) = 0.816497, and
 * the drawn vertical edge is 37 path units, so the cube's real edge is
 * 37 / 0.816497 = 45.3157 path units.
 */
const UNIT = 100 / 128; // one logo path unit, in cqw
const EDGE = 45.3157 * UNIT; // 35.403cqw
const HALF = EDGE / 2;
/** Logo stroke is 1.4 path units on screen; undo the foreshortening for a border. */
const BORDER = (1.4 / 0.816497) * UNIT;

const REST = { rotateX: -35.264, rotateY: 45 };
const OPEN = { rotateX: -9, rotateY: 12 };

/**
 * Cube centres, as percentages of the cluster box. These are the logo's own
 * offsets: the right cube shares the left cube's vertical edge and the top cube
 * seats exactly in the notch between them, so every seam is an edge two cubes
 * share. Changing a number here breaks the nesting.
 */
/**
 * Where each cube goes when the cluster breaks apart: straight up for the top
 * cube, and down the two 30° seams for the front pair, so it opens along its own
 * geometry instead of scattering.
 */
const TRAVEL = 7;

const BOB_AT = 3;
const SEPARATE_S = 0.34;
const TURN_S = 0.62;

/**
 * The three cubes, in the reading order of the proof points: 1 top, 2 left,
 * 3 right. `rise`, `draw` and `fill` are entrance timings in seconds: the cube
 * arrives, its outline traces, then its faces colour in.
 */
const CUBES = [
  { left: "50%", top: "28.5714%", x: 0, y: -TRAVEL, rise: 0.1, draw: 0.3, fill: 1.3 },
  { left: "25%", top: "71.4286%", x: -TRAVEL * 0.866, y: TRAVEL * 0.5, rise: 0.4, draw: 0.6, fill: 1.6 },
  { left: "75%", top: "71.4286%", x: TRAVEL * 0.866, y: TRAVEL * 0.5, rise: 0.7, draw: 0.9, fill: 1.9 },
];
type CubeConfig = (typeof CUBES)[number];

/**
 * One face. `rotate` puts its normal on the cube axis it belongs to, then
 * `translateZ(HALF)` pushes it out to the surface along that same normal.
 *
 * `drop` is the side whose edge this face does not draw. Handing every interior
 * edge to exactly one of the two faces that own it leaves nine strokes for the
 * cube's nine visible edges, all the same weight — a shared edge drawn by both
 * faces would sit two lines side by side at double the silhouette's weight.
 *
 * The edges are four line divs rather than a CSS border because they draw
 * themselves in: a border can only appear at full length, but a line scaled from
 * zero along its own axis traces. Horizontals run left to right and verticals
 * run top to bottom, so the nine strokes read as one hand moving over the cube.
 */
const SIDES = {
  top: { className: "left-0 top-0 w-full", axis: "scaleX", origin: "left center" },
  right: { className: "right-0 top-0 h-full", axis: "scaleY", origin: "center top" },
  bottom: { className: "bottom-0 left-0 w-full", axis: "scaleX", origin: "left center" },
  left: { className: "left-0 top-0 h-full", axis: "scaleY", origin: "center top" },
} as const;

type Side = keyof typeof SIDES;
const ALL_SIDES = Object.keys(SIDES) as Side[];

function Face({
  rotate,
  drop,
  fill,
  drawAt,
  fillAt,
  reduced,
  children,
}: {
  rotate: string;
  drop?: readonly ("top" | "right" | "bottom")[];
  fill: string;
  drawAt: number;
  fillAt: number;
  reduced: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 text-foreground [backface-visibility:hidden]"
      style={{ transform: `${rotate} translateZ(${HALF}cqw)` }}
    >
      {/* The face colour arrives after the outline does, so the stack reads as
          three cubes drawn and then filled — the logo assembling itself. */}
      <motion.div
        className="absolute inset-0"
        style={{ backgroundColor: fill }}
        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 1, delay: reduced ? 0 : fillAt }}
      />
      {/* Edges paint over the fill, so a face colour can never bleed past its
          own outline the way two stacked boxes would leave a hairline. */}
      {ALL_SIDES.filter((side) => !drop?.includes(side as "top" | "right" | "bottom")).map(
        (side) => {
          const { className, axis, origin } = SIDES[side];
          return (
            <motion.div
              key={side}
              className={`absolute bg-current ${className}`}
              style={{
                [axis === "scaleX" ? "height" : "width"]: `${BORDER}cqw`,
                transformOrigin: origin,
              }}
              initial={reduced ? { [axis]: 1 } : { [axis]: 0 }}
              animate={{ [axis]: 1 }}
              transition={{
                duration: reduced ? 0 : 1,
                ease: [0.4, 0, 0.2, 1],
                delay: reduced ? 0 : drawAt,
              }}
            />
          );
        }
      )}
      {children}
    </div>
  );
}

function StackCube({
  cube,
  index,
  label,
  text,
  open,
  reduced,
}: {
  cube: CubeConfig;
  index: number;
  label: string;
  text: string;
  open: boolean;
  reduced: boolean;
}) {
  const [top, left, right] = FACE_FILLS;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d]"
      style={{
        width: `${EDGE}cqw`,
        height: `${EDGE}cqw`,
        left: cube.left,
        top: cube.top,
      }}
    >
      {/* Entrance: each cube settles into place while its outline draws. */}
      <motion.div
        className="h-full w-full [transform-style:preserve-3d]"
        initial={reduced ? { y: 0 } : { y: 14 }}
        animate={{ y: 0 }}
        transition={{
          duration: reduced ? 0 : 1.2,
          ease: [0.4, 0, 0.2, 1],
          delay: reduced ? 0 : cube.rise,
        }}
      >
        {/* Step one: make room. Moving out leads the turn; moving back trails it. */}
        <motion.div
          className="h-full w-full [transform-style:preserve-3d]"
          animate={
            open ? { x: `${cube.x}cqw`, y: `${cube.y}cqw` } : { x: "0cqw", y: "0cqw" }
          }
          transition={{
            duration: reduced ? 0 : SEPARATE_S,
            ease: [0.4, 0, 0.2, 1],
            delay: reduced || open ? 0 : TURN_S * 0.5,
          }}
        >
          {/* Step two: turn the cube to face the reader. */}
          <motion.div
            className="relative h-full w-full [transform-style:preserve-3d]"
            initial={REST}
            animate={open ? OPEN : REST}
            transition={{
              duration: reduced ? 0 : TURN_S,
              ease: [0.4, 0, 0.2, 1],
              delay: reduced || !open ? 0 : SEPARATE_S + index * 0.09,
            }}
          >
            <Face
              rotate="rotateX(90deg)"
              drop={["bottom"]}
              fill={top}
              drawAt={cube.draw}
              fillAt={cube.fill}
              reduced={reduced}
            />
            <Face
              rotate="rotateY(-90deg)"
              drop={["top", "right"]}
              fill={left}
              drawAt={cube.draw}
              fillAt={cube.fill}
              reduced={reduced}
            />
            <Face
              rotate="rotateY(0deg)"
              fill={right}
              drawAt={cube.draw}
              fillAt={cube.fill}
              reduced={reduced}
            >
              {/* The proof point is painted on the front face. It is unreadable
                  edge-on at rest and square to the reader once the cube turns,
                  which is the whole point of the gesture. */}
              <motion.div
                className="absolute inset-0 flex flex-col justify-center gap-[3cqw] p-[4.5cqw] text-[#0b1220]"
                animate={{ opacity: open ? 1 : 0 }}
                transition={{
                  duration: reduced ? 0 : 0.3,
                  delay: reduced || !open ? 0 : SEPARATE_S + TURN_S * 0.45,
                }}
              >
                <span className="font-display text-[max(1.05rem,4.4cqw)] font-bold leading-none tracking-[0.06em]">
                  {label}
                </span>
                <p className="text-[max(0.75rem,2.7cqw)] font-semibold leading-[1.4]">{text}</p>
              </motion.div>
            </Face>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function CubeStack() {
  const points = siteContent.hero.proofPoints;
  const [open, setOpen] = useState(false);
  // `useReducedMotion` reads matchMedia during render, so it disagrees with the
  // server on the first pass. Gate the swap on mount to keep hydration clean.
  const prefersReduced = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = mounted && prefersReduced;

  const frame = useRef<HTMLDivElement>(null);
  // Cursor position, -1..1 on each axis, sprung so the tilt trails the pointer.
  const mx = useSpring(useMotionValue(0), { stiffness: 90, damping: 20 });
  const my = useSpring(useMotionValue(0), { stiffness: 90, damping: 20 });
  // Kept small enough that the parallax can never swing a cube past the point
  // where a fourth, unbuilt face would come into view.
  const rotateY = useTransform(mx, [-1, 1], [-6.5, 6.5]);
  const rotateX = useTransform(my, [-1, 1], [5.2, -5.2]);

  return (
    <div
      ref={frame}
      tabIndex={0}
      role="group"
      aria-label="How a bcns project runs"
      className="w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      onMouseEnter={() => setOpen(true)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onMouseMove={(e) => {
        if (reduced) return;
        const r = frame.current?.getBoundingClientRect();
        if (!r) return;
        mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
        my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
      }}
      onMouseLeave={() => {
        setOpen(false);
        mx.set(0);
        my.set(0);
      }}
    >
      {/* No `perspective` anywhere above the cubes, deliberately: the projection
          has to be orthographic or the three cubes, sitting at three different
          points on screen, would each converge slightly differently and the
          shared edges of the logo would stop meeting. */}
      <motion.div
        style={reduced ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
      >
        {/* Bob — the whole stack, so alignment cannot break. */}
        <motion.div
          className="[transform-style:preserve-3d]"
          animate={reduced ? {} : { y: [0, -18.2, 0] }}
          transition={{
            duration: 6,
            ease: "easeInOut",
            repeat: Infinity,
            delay: BOB_AT,
          }}
        >
          <div className="relative mx-auto aspect-[256/259] w-full max-w-[33.625rem] [container-type:inline-size] [transform-style:preserve-3d]">
            {CUBES.map((cube, i) => (
              <StackCube
                key={i}
                cube={cube}
                index={i}
                label={`0${i + 1}`}
                text={points[i] ?? ""}
                open={open}
                reduced={reduced}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
