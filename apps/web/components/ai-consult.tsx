import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER, CubeBullet } from "@/components/kit";

/**
 * What a day of AI consulting actually consists of.
 *
 * Deliberately not the three-card row the home page uses for process: the
 * heading and the day rate hold a sticky left column, and the three steps run
 * down the right as hairline rows on a single spine. It reads as one day going
 * forward in time rather than three interchangeable tiles.
 */
export function AiConsult() {
  const { eyebrow, title, description, rate, steps } = siteContent.aiConsult;

  return (
    <section id="ai-consult" className="border-b border-border">
      <div className={`${GUTTER} grid gap-12 py-16 sm:py-[4.5rem] lg:grid-cols-[22rem_1fr] lg:gap-20`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            delay={80}
            className="mt-4 text-balance text-[clamp(1.75rem,3.6vw,2.375rem)] font-light leading-[1.14] tracking-[-0.02em]"
          >
            {title}
          </Reveal>
          <Reveal as="p" delay={160} className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
            {description}
          </Reveal>
          <Reveal as="p" delay={220} className="mt-7 text-[2.25rem] font-semibold tracking-[-0.02em] text-primary">
            {rate}
          </Reveal>
        </div>

        {/* The spine: one hairline down the left of the steps, so the three read
            as stages of the same day rather than three separate offers. */}
        <ol className="relative border-l border-border pl-8 sm:pl-11">
          {steps.map(({ step, title: stepTitle, description: stepBody }, i) => (
            <Reveal
              as="li"
              key={step}
              delay={i * 110}
              className={`relative ${i === steps.length - 1 ? "pb-0" : "pb-11 sm:pb-14"}`}
            >
              {/* The bullet straddles the spine — the motif marking the beat. */}
              <span
                aria-hidden
                className="absolute -left-[2.4375rem] top-0 flex bg-background py-1 sm:-left-[3.1875rem]"
              >
                <CubeBullet />
              </span>
              <p className="font-display text-[0.8125rem] font-medium tracking-[0.16em] text-primary">
                {step}
              </p>
              <h3 className="mt-2.5 text-[1.25rem] font-semibold leading-snug sm:text-[1.4375rem]">
                {stepTitle}
              </h3>
              <p className="mt-3 max-w-[46ch] text-[0.96875rem] leading-[1.7] text-muted-foreground">
                {stepBody}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
