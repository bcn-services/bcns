"use client";

import * as React from "react";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER, emphasize } from "@/components/kit";

/**
 * FAQ as hairline rows beside a sticky heading. The prototype uses native
 * <details>; this stays a client component so the answers can animate their
 * height, and so more than one can be open at once.
 */
export function Faq() {
  const { eyebrow, title, description, items } = siteContent.faq;
  const [open, setOpen] = React.useState<number[]>([]);

  const toggle = (index: number) =>
    setOpen((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index]
    );

  return (
    <section id="faq" aria-labelledby="faq-heading" className="border-t border-border">
      <div
        className={`${GUTTER} grid gap-10 pb-24 pt-[5.5rem] lg:grid-cols-[4fr_7fr] lg:items-start lg:gap-[5.5rem]`}
      >
        <div className="lg:sticky lg:top-[calc(4rem+2rem)]">
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            id="faq-heading"
            delay={80}
            className="mt-4 text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]"
          >
            {emphasize(title, siteContent.connectDemo.faqEmphasis)}
          </Reveal>
          <Reveal as="p" delay={160} className="mt-[1.125rem] max-w-[26rem] text-[1.0625rem] leading-[1.6] text-muted-foreground">
            {description}
          </Reveal>
        </div>

        <div className="border-t border-border">
          {items.map(({ question, answer }, index) => {
            const isOpen = open.includes(index);
            return (
              <div key={question} className="border-b border-border">
                <h3>
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${index}`}
                    className="group flex w-full items-center justify-between gap-6 rounded-md px-1 py-6 text-left font-display text-[1.1875rem] font-medium leading-[1.35] tracking-[-0.005em] transition-colors hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {question}
                    <span
                      aria-hidden
                      className={`shrink-0 text-[1.75rem] font-light leading-none transition-[transform,color] duration-300 ease-out ${
                        isOpen ? "rotate-45 text-primary" : "text-muted-foreground"
                      }`}
                    >
                      +
                    </span>
                  </button>
                </h3>
                {/* Height animated via grid-rows 0fr→1fr — no measuring needed. */}
                <div
                  id={`faq-answer-${index}`}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-[40rem] px-1 pb-7 leading-[1.75] text-muted-foreground">
                      {answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
