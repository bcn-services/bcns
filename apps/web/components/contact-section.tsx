"use client";

/**
 * Contact band — full-bleed to match the nav rows above it. Highlights are
 * keyed by the same cube-face swatches as the rest of the page instead of
 * lucide icon tiles, so the whole homepage speaks one visual language.
 */

import { motion } from "framer-motion";
import { ContactForm } from "@/components/contact-form";
import { siteContent } from "@/lib/content";
import { FACE_FILLS } from "@/components/cube";

const rise = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
};

export function ContactSection() {
  const { eyebrow, title, description, highlights } = siteContent.contactSection;

  return (
    <section id="contact" className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_55%,hsl(214_88%_73%/0.12),transparent_75%)]"
      />
      <div className="mx-auto grid w-full max-w-[90rem] gap-12 px-6 py-20 lg:grid-cols-[1fr_1fr] lg:gap-20 lg:px-12 lg:py-24">
        <motion.div {...rise} transition={{ duration: 0.55 }}>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
          <h2 className="mt-5 max-w-[14ch] text-balance font-display text-[clamp(1.875rem,3.4vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.02em]">
            {title}
          </h2>
          <p className="mt-5 max-w-md text-pretty leading-relaxed text-muted-foreground">
            {description}
          </p>
          <ul role="list" className="mt-10 flex flex-col gap-7 border-t border-border/60 pt-8">
            {highlights.map((h, i) => (
              <li key={h.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-1.5 size-3.5 shrink-0 rotate-45 border-2 border-foreground/70"
                  style={{ background: FACE_FILLS[i % 3] }}
                />
                <div>
                  <p className="font-display font-semibold tracking-tight">{h.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {h.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          {...rise}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
        >
          <ContactForm />
        </motion.div>
      </div>
    </section>
  );
}
