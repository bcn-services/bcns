"use client";

/**
 * Hero centerpiece: the three process steps as CSS-3D cubes stacked in the
 * logo triangle. Faces are DOM elements, not canvas — the step text on the
 * back face stays real, selectable, crisp text.
 *
 * At rest the stack is corner-on (rotateX -26 / rotateY 45) so the top/front/
 * right faces read like the drawn logo shading. Activating a cube spreads the
 * stack apart, scales that cube up, and spins it to near-face-on — a few
 * degrees of tilt kept on purpose so it still reads as an object, not a card.
 *
 * Interaction is pointer-hover, click/tap, and keyboard focus, all driving the
 * same `active` index. `prefers-reduced-motion` swaps the whole thing for a
 * static list — no spread, no spin, all three descriptions visible at once.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { siteContent } from "@/lib/content";
import type { StepItem } from "@/lib/content";
import { FACE_FILLS } from "@/components/cube";

const [FACE_TOP, FACE_FRONT, FACE_RIGHT] = FACE_FILLS;

// Offsets as a fraction of cube edge, per cube in logo-triangle order
// (top, bottom-left, bottom-right).
//
// The open cube pulls toward the triangle's centre rather than away from it:
// it is the one that grows, so it needs the room, and a cube that stayed put
// while scaling would run off the right edge of a phone screen.
const RECENTRE = [
  { x: 0, y: 0.16 },
  { x: 0.26, y: -0.12 },
  { x: -0.26, y: -0.12 },
];
// The other two step outward to clear it.
const SPREAD = [
  { x: 0, y: -0.34 },
  { x: -0.42, y: 0.24 },
  { x: 0.42, y: 0.24 },
];

const REST = { rotateX: -26, rotateY: 45 };
// Near-face-on, not flat: a few degrees keep the lit top edge visible so the
// revealed face still reads as a cube face. Any more tilt and the cube's own
// right face swings across the copy.
const OPEN = { rotateX: -5, rotateY: 177 };

const faceStyle = "absolute inset-0 border-2 border-foreground/80";

function Cube({
  item,
  index,
  active,
  setActive,
}: {
  item: StepItem;
  index: number;
  active: number | null;
  setActive: (i: number | null) => void;
}) {
  const isActive = active === index;
  const dimmed = active !== null && !isActive;
  const offset = isActive ? RECENTRE[index]! : dimmed ? SPREAD[index]! : { x: 0, y: 0 };

  // Scale lives on a CSS-transitioned wrapper, not on the motion element: the
  // open scale is a responsive CSS var, which framer-motion cannot animate.
  return (
    <div
      className="relative transition-transform duration-500 ease-out"
      style={{
        transform: isActive ? "scale(var(--cube-open-scale))" : "scale(1)",
        zIndex: isActive ? 10 : 1,
      }}
    >
    <motion.div
      className="relative [width:var(--cube)] [height:var(--cube)] [perspective:1400px]"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: dimmed ? 0.38 : 1,
        scale: dimmed ? 0.9 : 1,
        x: `${offset.x * 100}%`,
        y: `${offset.y * 100}%`,
      }}
      transition={{
        opacity: { duration: 0.3 },
        scale: { type: "spring", stiffness: 180, damping: 22 },
        x: { type: "spring", stiffness: 220, damping: 24 },
        y: { type: "spring", stiffness: 220, damping: 24 },
      }}
    >
      <button
        type="button"
        aria-expanded={isActive}
        onClick={() => setActive(isActive ? null : index)}
        onMouseEnter={() => setActive(index)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(index)}
        onBlur={() => setActive(null)}
        className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <motion.span
          className="relative block h-full w-full [transform-style:preserve-3d]"
          animate={isActive ? OPEN : REST}
          transition={{ type: "spring", stiffness: 95, damping: 16 }}
        >
          {/* Outward faces — decorative; the cube's meaning is on the back. */}
          <span
            aria-hidden
            className={faceStyle}
            style={{ background: FACE_FRONT, transform: "translateZ(calc(var(--cube) / 2))" }}
          >
            <span
              className="absolute top-[8%] left-[8%] font-mono text-[length:calc(var(--cube)/13)] font-medium"
              style={{ color: "hsl(214 62% 28%)" }}
            >
              {item.step}
            </span>
          </span>
          <span
            aria-hidden
            className={faceStyle}
            style={{ background: FACE_RIGHT, transform: "rotateY(90deg) translateZ(calc(var(--cube) / 2))" }}
          />
          <span
            aria-hidden
            className={faceStyle}
            style={{ background: FACE_FRONT, transform: "rotateY(-90deg) translateZ(calc(var(--cube) / 2))" }}
          />
          <span
            aria-hidden
            className={faceStyle}
            style={{ background: FACE_TOP, transform: "rotateX(90deg) translateZ(calc(var(--cube) / 2))" }}
          />
          <span
            aria-hidden
            className={faceStyle}
            style={{ background: FACE_RIGHT, transform: "rotateX(-90deg) translateZ(calc(var(--cube) / 2))" }}
          />

          {/* Back face — the reveal. Sized in cube-relative units so the copy
              keeps the same optical size at every breakpoint. */}
          <span
            // The shadow is painted in this face's own 3D plane, so it would
            // leak out over the cube's top face at rest — only cast it while
            // the face is the one being read.
            className={`${faceStyle} flex flex-col bg-card p-[6.5%] text-left transition-shadow duration-300 ${
              isActive ? "shadow-[0_20px_50px_-18px_hsl(214_62%_35%/0.55)]" : "shadow-none"
            }`}
            style={{ transform: "rotateY(180deg) translateZ(calc(var(--cube) / 2))" }}
          >
            <span className="font-mono text-[length:calc(var(--cube)/19)] font-medium tracking-widest text-primary">
              {item.step}
            </span>
            <span className="mt-[2%] font-display text-[length:calc(var(--cube)/13)] font-semibold leading-tight tracking-tight text-card-foreground">
              {item.title}
            </span>
            <span className="mt-[4%] text-[length:calc(var(--cube)/19)] leading-[1.45] text-muted-foreground">
              {item.description}
            </span>
          </span>
        </motion.span>
      </button>
    </motion.div>
    </div>
  );
}

export function CubeStack() {
  const { items } = siteContent.howItWorks;
  const [active, setActive] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  // useReducedMotion reads matchMedia during render, so it disagrees with the
  // server on the first pass. Gate the swap on mount to keep hydration clean.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Ambient parallax: the stack drifts a few pixels toward the cursor so it
  // reads as an object sitting in the page rather than an image pasted on it.
  const frame = useRef<HTMLDivElement>(null);
  const px = useSpring(useMotionValue(0), { stiffness: 90, damping: 20 });
  const py = useSpring(useMotionValue(0), { stiffness: 90, damping: 20 });

  if (mounted && reduceMotion) {
    return (
      <ul role="list" className="flex flex-col gap-5">
        {items.map((item, i) => (
          <li key={item.step} className="flex gap-4 rounded-xl border border-border bg-card p-5">
            <span
              aria-hidden
              className="mt-1 size-4 shrink-0 rotate-45 border-2 border-foreground/80"
              style={{ background: FACE_FILLS[i]! }}
            />
            <div>
              <p className="font-mono text-xs font-medium tracking-widest text-primary">{item.step}</p>
              <p className="mt-1 font-display text-lg font-semibold tracking-tight">{item.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className="flex flex-col items-center [--cube-open-scale:1.85] [--cube:clamp(6.75rem,20vw,10rem)] sm:[--cube-open-scale:1.4] lg:[--cube-open-scale:1.3]"
      ref={frame}
      onMouseMove={(e) => {
        const r = frame.current?.getBoundingClientRect();
        if (!r) return;
        px.set(((e.clientX - r.left) / r.width - 0.5) * 18);
        py.set(((e.clientY - r.top) / r.height - 0.5) * 14);
      }}
      onMouseLeave={() => {
        setActive(null);
        px.set(0);
        py.set(0);
      }}
    >
      <motion.div style={{ x: px, y: py }} className="flex flex-col items-center py-[8%]">
        <Cube item={items[0]} index={0} active={active} setActive={setActive} />
        <div className="mt-[calc(var(--cube)*-0.22)] flex gap-[calc(var(--cube)*0.04)]">
          <Cube item={items[1]} index={1} active={active} setActive={setActive} />
          <Cube item={items[2]} index={2} active={active} setActive={setActive} />
        </div>
      </motion.div>
      <p
        aria-hidden
        className={`mt-6 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground/80 transition-opacity duration-300 ${
          active !== null ? "opacity-0" : "opacity-100"
        }`}
      >
        <span className="hidden sm:inline">hover a block</span>
        <span className="sm:hidden">tap a block</span>
      </p>
    </div>
  );
}
