"use client";

import * as React from "react";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER } from "@/components/kit";

/**
 * FAQ as hairline rows. The artboard opens each row on hover; here it opens on
 * click — hover-only disclosure is unreachable by keyboard and by touch, and
 * this is where the answers actually live.
 */
export function Faq() {
  const { eyebrow, title, description, items } = siteContent.faq;
  const [open, setOpen] = React.useState<number[]>([]);

  const toggle = (index: number) =>
    setOpen((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index]
    );

  return (
    <section id="faq" className="border-b border-border">
      <div className={`${GUTTER} grid gap-8 pb-8 pt-16 sm:pt-[4.25rem] lg:grid-cols-2 lg:gap-16`}>
        <div>
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            delay={80}
            className="mt-4 text-balance text-[clamp(1.75rem,3.6vw,2.25rem)] font-light leading-[1.2] tracking-[-0.015em]"
          >
            {title}
          </Reveal>
        </div>
        <Reveal as="p" delay={160} className="self-end text-[0.96875rem] leading-[1.6] text-muted-foreground">
          {description}
        </Reveal>
      </div>

      <div className="mx-auto flex w-full max-w-[90rem] flex-col px-4 pb-14 pt-2 lg:px-10">
        {items.map(({ question, answer }, index) => {
          const isOpen = open.includes(index);
          return (
            <Reveal key={question} delay={index * 70}>
              {index > 0 && <div aria-hidden className="mx-8 h-px bg-border" />}
              <div className="rounded-xl transition-colors duration-300 hover:bg-secondary">
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-6 px-6 py-[1.625rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-8"
                >
                  <span className="text-[1.125rem] font-semibold sm:text-[1.25rem]">{question}</span>
                  <span
                    aria-hidden
                    className={`shrink-0 text-2xl text-muted-foreground transition-transform duration-300 ease-out ${
                      isOpen ? "rotate-45 text-primary" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                {/* Height animated via grid-rows 0fr→1fr — no measuring needed. */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-[56.25rem] px-6 pb-6 text-[0.90625rem] leading-[1.7] text-muted-foreground sm:px-8">
                      {answer}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
