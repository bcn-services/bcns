import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER } from "@/components/kit";

/**
 * The three-step process, in the two shapes the artboards give it:
 * `cards` (home — three hairline cards under a split heading) and `rows`
 * (services — compact step-lines under a single-column heading).
 *
 * Server component: the entrance work is all `Reveal`, which owns its own
 * client boundary.
 */
export function HowItWorks({ variant = "cards" }: { variant?: "cards" | "rows" }) {
  const { eyebrow, title, description, items } = siteContent.howItWorks;

  if (variant === "rows") {
    return (
      <section id="how-it-works" className="border-b border-border">
        <div className={`${GUTTER} pb-7 pt-16 sm:pt-[4.25rem]`}>
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            delay={80}
            className="mt-4 max-w-[45rem] text-balance text-[clamp(1.75rem,3.4vw,2rem)] font-light leading-[1.25] tracking-[-0.015em]"
          >
            {title}
          </Reveal>
        </div>
        <div className="mx-auto flex w-full max-w-[90rem] flex-col px-4 pb-14 lg:px-10">
          {items.map((item, i) => (
            <Reveal key={item.step} delay={i * 90}>
              {i > 0 && <div aria-hidden className="mx-8 h-px bg-border" />}
              <div className="grid items-center gap-4 rounded-xl px-6 py-6 transition-colors duration-300 hover:bg-secondary sm:grid-cols-[5.625rem_12.5rem_1fr] sm:gap-8 sm:px-8">
                <span className="font-display text-[1.875rem] font-bold text-primary">
                  {item.step}
                </span>
                <span className="text-[1.1875rem] font-semibold">{item.title}</span>
                <span className="text-[0.90625rem] leading-[1.65] text-muted-foreground">
                  {item.description}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="how-it-works" className="border-b border-border">
      <div className={`${GUTTER} grid gap-8 pb-10 pt-16 sm:pt-[4.75rem] lg:grid-cols-[1fr_1.4fr] lg:gap-16`}>
        <div>
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            delay={80}
            className="mt-[1.125rem] text-balance text-[clamp(1.75rem,3.6vw,2.25rem)] font-light leading-[1.2] tracking-[-0.015em]"
          >
            {title}
          </Reveal>
        </div>
        <Reveal
          as="p"
          delay={160}
          className="max-w-[28.75rem] self-end text-[1rem] leading-[1.6] text-muted-foreground"
        >
          {description}
        </Reveal>
      </div>

      <ol className={`${GUTTER} grid gap-6 pb-16 pt-3 sm:pb-[4.5rem] md:grid-cols-3`}>
        {items.map((item, i) => (
          <Reveal
            as="li"
            key={item.step}
            delay={i * 110}
            className="lift-card rounded-2xl border border-border bg-card p-[1.875rem] pt-[2.125rem]"
          >
            <span className="font-display text-[2.5rem] font-bold leading-none text-primary">
              {item.step}
            </span>
            <h3 className="mt-[1.125rem] text-[1.4375rem] font-semibold">{item.title}</h3>
            <p className="mt-3 text-[0.90625rem] leading-[1.7] text-muted-foreground">
              {item.description}
            </p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
