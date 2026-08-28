"use client";

/**
 * Homepage hero: editorial copy left, interactive cube stack right. The stack
 * carries the three process steps, so the hero does the work the old
 * how-it-works block used to — no second section repeating it.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@nseluga/ui";
import { siteContent } from "@/lib/content";
import { CubeStack } from "@/components/cube-stack";

const rise = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function Hero() {
  const { hero } = siteContent;
  return (
    <section id="top" className="relative overflow-hidden border-b border-border/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_65%_at_78%_42%,hsl(214_88%_73%/0.16),transparent_70%)]"
      />
      <div className="mx-auto grid w-full max-w-[90rem] items-center gap-14 px-6 pt-16 pb-20 sm:pt-24 sm:pb-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-12">
        <div>
          <motion.p
            {...rise}
            transition={{ duration: 0.5 }}
            className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-primary sm:text-xs sm:tracking-[0.22em]"
          >
            {hero.badge}
          </motion.p>
          <motion.h1
            {...rise}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-6 max-w-[16ch] text-balance font-display text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.04] tracking-[-0.02em]"
          >
            {hero.headline}
          </motion.h1>
          <motion.p
            {...rise}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            {hero.subheadline}
          </motion.p>
          <motion.div
            {...rise}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
          >
            <Link href="/#contact" className={`${buttonVariants({ size: "lg" })} hover-glow w-full sm:w-auto`}>
              {hero.ctaPrimary}
              <ArrowRight aria-hidden />
            </Link>
            <Link
              href="/services#examples"
              className={`${buttonVariants({ variant: "outline", size: "lg" })} w-full sm:w-auto`}
            >
              {hero.ctaSecondary}
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <CubeStack />
        </motion.div>
      </div>
    </section>
  );
}
