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

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { siteContent } from "@/lib/content";
import type { StepItem } from "@/lib/content";
import { FACE_FILLS } from "@/components/cube";

const [FACE_TOP, FACE_FRONT, FACE_RIGHT] = FACE_FILLS;

// Spread offsets when the stack opens, as a fraction of cube edge, per cube
// in logo-triangle order (top, bottom-left, bottom-right).
const SPREAD = [
  { x: 0, y: -0.2 },
  { x: -0.29, y: 0.16 },
  { x: 0.29, y: 0.16 },
];

const REST = { rotateX: -26, rotateY: 45 };
// Near-face-on, not flat: keeping a few degrees means the lit top edge is
// still visible, so the revealed face reads as a cube face, not a flat card.
const OPEN = { rotateX: -7, rotateY: 172 };

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
  const spread = active !== null ? SPREAD[index]! : { x: 0, y: 0 };

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
      className="[width:var(--cube)] [height:var(--cube)] [perspective:1400px]"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: dimmed ? 0.5 : 1,
        scale: dimmed ? 0.92 : 1,
        x: `${spread.x * 100}%`,
        y: `${spread.y * 100}%`,
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
            <span className="absolute bottom-[8%] left-[8%] font-mono text-[length:calc(var(--cube)/13)] font-medium text-foreground/70">
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
            className={`${faceStyle} flex flex-col bg-card p-[6.5%] text-left`}
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

  if (reduceMotion) {
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
      className="flex flex-col items-center [--cube-open-scale:1.5] [--cube:clamp(9.5rem,30vw,15rem)] sm:[--cube-open-scale:1.25] lg:[--cube-open-scale:1.18]"
      onMouseLeave={() => setActive(null)}
    >
      <div className="flex flex-col items-center py-[8%]">
        <Cube item={items[0]} index={0} active={active} setActive={setActive} />
        <div className="mt-[calc(var(--cube)*-0.22)] flex gap-[calc(var(--cube)*0.04)]">
          <Cube item={items[1]} index={1} active={active} setActive={setActive} />
          <Cube item={items[2]} index={2} active={active} setActive={setActive} />
        </div>
      </div>
      <p
        aria-hidden
        className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground/60"
      >
        <span className="hidden sm:inline">hover a block</span>
        <span className="sm:hidden">tap a block</span>
      </p>
    </div>
  );
}
