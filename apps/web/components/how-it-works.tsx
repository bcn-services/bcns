"use client";

import * as React from "react";
import { Search, Hammer, Rocket } from "lucide-react";
import { Container, SectionHeading } from "@nseluga/ui";
import { siteContent } from "@/lib/content";

const stepIcons = [Search, Hammer, Rocket] as const;

export function HowItWorks() {
  const { eyebrow, title, description, items } = siteContent.howItWorks;
  const ref = React.useRef<HTMLDivElement>(null);
  // `active` drives the connector fill + sequenced node reveals; fires once when
  // the flow scrolls into view. Reduced-motion → active immediately, no animation.
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="border-t border-border/60 bg-secondary/70 py-24 sm:py-28">
      <Container>
        <SectionHeading eyebrow={eyebrow} title={title} accent="every" description={description} />

        <div ref={ref} className="relative mt-16">
          {/* Desktop: horizontal connector between the three node centers (cols at
              1/6, 1/2, 5/6). Track + primary fill that grows left→right on entry. */}
          <div
            aria-hidden
            className="absolute left-[16.666%] right-[16.666%] top-6 hidden h-0.5 -translate-y-1/2 bg-border md:block"
          />
          <div
            aria-hidden
            className={`absolute left-[16.666%] right-[16.666%] top-6 hidden h-0.5 origin-left -translate-y-1/2 bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)] transition-transform duration-[1400ms] ease-out md:block ${
              active ? "scale-x-100" : "scale-x-0"
            }`}
          />
          {/* Mobile: vertical connector down the left rail of the badges. */}
          <div
            aria-hidden
            className="absolute bottom-8 left-6 top-8 w-0.5 -translate-x-1/2 bg-border md:hidden"
          />
          <div
            aria-hidden
            className={`absolute bottom-8 left-6 top-8 w-0.5 origin-top -translate-x-1/2 bg-primary transition-transform duration-[1400ms] ease-out md:hidden ${
              active ? "scale-y-100" : "scale-y-0"
            }`}
          />

          <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
            {items.map(({ step, title: stepTitle, description: stepDescription }, index) => {
              const Icon = stepIcons[index];
              if (!Icon) return null;
              const delay = active ? index * 260 : 0;
              return (
                <li
                  key={index}
                  className="relative flex gap-5 md:flex-col md:items-center md:gap-5 md:text-center"
                >
                  {/* Numbered node badge — sits on the connector; pops in in sequence. */}
                  <span
                    className={`relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-2 bg-background shadow-sm transition-[transform,opacity,border-color,color] duration-500 ease-out ${
                      active
                        ? "scale-100 border-primary text-primary opacity-100"
                        : "scale-75 border-border text-muted-foreground opacity-0"
                    }`}
                    style={{ transitionDelay: `${delay}ms` }}
                  >
                    <Icon className="size-6" aria-hidden />
                    <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold tabular-nums text-primary-foreground">
                      {index + 1}
                    </span>
                  </span>
                  <div
                    className={`flex flex-col gap-2 transition-[transform,opacity] duration-500 ease-out md:items-center ${
                      active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                    }`}
                    style={{ transitionDelay: `${delay + 120}ms` }}
                  >
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {step}
                    </span>
                    <h3 className="text-xl font-semibold">{stepTitle}</h3>
                    <p className="text-pretty leading-relaxed text-muted-foreground md:max-w-xs">
                      {stepDescription}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>
    </section>
  );
}
