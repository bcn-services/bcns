"use client";

/**
 * Homepage hero: editorial copy left, the interactive cube stack right, split
 * by a vertical hairline that continues the page's rule system into the section
 * rather than boxing the two halves separately.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { siteContent } from "@/lib/content";
import { CubeStack } from "@/components/cube-stack";
import { Eyebrow, emphasize } from "@/components/kit";

const rise = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
};
const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const { hero } = siteContent;

  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto grid w-full max-w-[90rem] lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col items-start justify-center px-6 pb-16 pt-16 sm:pb-20 sm:pt-20 lg:border-r lg:border-border lg:py-[6.5rem] lg:pl-[4.5rem] lg:pr-12">
          <motion.div {...rise} transition={{ duration: 0.55, ease: EASE }}>
            <Eyebrow>{hero.badge}</Eyebrow>
          </motion.div>

          <motion.h1
            {...rise}
            transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
            className="mt-6 max-w-[13ch] text-balance text-[clamp(2.5rem,6.2vw,4.25rem)] font-light leading-[1.06] tracking-[-0.025em]"
          >
            {emphasize(hero.headline, "already works")}
          </motion.h1>

          <motion.p
            {...rise}
            transition={{ duration: 0.6, ease: EASE, delay: 0.16 }}
            className="mt-6 max-w-md text-pretty text-[1.1875rem] leading-relaxed text-muted-foreground"
          >
            {hero.subheadline}
          </motion.p>

          <motion.div
            {...rise}
            transition={{ duration: 0.6, ease: EASE, delay: 0.24 }}
            className="mt-11 flex w-full flex-col gap-4 sm:w-auto sm:flex-row"
          >
            <Link
              href="/#contact"
              className="lift-button rounded-lg bg-primary px-[1.875rem] py-4 text-center text-[0.9375rem] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {hero.ctaPrimary}
            </Link>
            <Link
              href="/services#examples"
              className="rounded-lg border border-input px-[1.875rem] py-4 text-center text-[0.9375rem] font-medium transition-colors duration-200 hover:border-accent hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {hero.ctaSecondary}
            </Link>
          </motion.div>
        </div>

        <div className="flex items-center justify-center px-6 pb-16 pt-4 sm:px-10 lg:py-[3.75rem]">
          <CubeStack />
        </div>
      </div>
    </section>
  );
}
