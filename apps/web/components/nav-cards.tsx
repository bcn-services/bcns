"use client";

/**
 * Site navigation as full-width editorial rows — one per destination, each
 * spanning the viewport, keyed by a cube-face swatch. Replaces the old card
 * grid: fewer boxes, more room for the description to actually be read.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { siteContent } from "@/lib/content";
import { FACE_FILLS } from "@/components/cube";

export function NavCards() {
  const { navCards } = siteContent;
  return (
    <nav aria-label="Sections" className="border-b border-border/60">
      <ul role="list" className="divide-y divide-border/60">
        {navCards.items.map((card, i) => (
          <motion.li
            key={card.href}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: i * 0.05 }}
          >
            <Link
              href={card.href}
              className="group mx-auto grid w-full max-w-[90rem] items-baseline gap-2 px-6 py-8 transition-colors duration-200 hover:bg-primary/[0.06] focus-visible:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[1.25rem_minmax(9rem,1fr)_2.2fr_auto] sm:gap-8 sm:py-9 lg:px-12"
            >
              <span
                aria-hidden
                className="hidden size-3.5 rotate-45 self-center border-2 border-foreground/70 transition-transform duration-300 group-hover:rotate-[135deg] sm:block"
                style={{ background: FACE_FILLS[i % 3] }}
              />
              <span className="font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                {card.title}
              </span>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mt-0 sm:text-base">
                {card.description}
              </p>
              <ArrowRight
                className="hidden size-5 self-center text-muted-foreground/50 transition-[transform,color] duration-200 group-hover:translate-x-1.5 group-hover:text-primary sm:block"
                aria-hidden
              />
            </Link>
          </motion.li>
        ))}
      </ul>
    </nav>
  );
}
