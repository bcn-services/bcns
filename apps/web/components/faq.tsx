"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Container, SectionHeading } from "@nseluga/ui";
import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";

export function Faq() {
  const { eyebrow, title, description, items } = siteContent.faq;
  const [open, setOpen] = React.useState<number[]>([]);

  const toggle = (index: number) =>
    setOpen((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index]
    );

  return (
    <section id="faq" className="border-t border-border/60 bg-secondary/70 py-24 sm:py-28">
      <Container>
        <SectionHeading eyebrow={eyebrow} title={title} accent="questions" description={description} />

        <div className="mx-auto mt-14 flex max-w-3xl flex-col gap-3">
          {items.map(({ question, answer }, index) => {
            const isOpen = open.includes(index);
            return (
              <Reveal as="div" key={index} delay={index * 70}>
                <div
                  className={`overflow-hidden rounded-xl border bg-card transition-colors duration-300 ${
                    isOpen ? "border-primary/40" : "border-border hover:border-primary/25"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="font-display text-base font-semibold tracking-tight">
                      {question}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`size-5 shrink-0 text-primary transition-transform duration-300 ease-out ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {/* Animated height via grid-rows 0fr→1fr (no measuring needed). */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 leading-relaxed text-muted-foreground">{answer}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
