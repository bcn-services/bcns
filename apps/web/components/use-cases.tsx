import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Cube } from "@/components/cube";
import { Eyebrow, GUTTER } from "@/components/kit";

/**
 * The Deluxe builds: a short heading, then the four examples as a 2×2 grid of
 * hairline cells — no cards, no gaps: the page's rule system doing the
 * dividing. Each cell carries a pill tag and the cube motif in its top corner.
 *
 * The page-level heading lives in the page's `PageHead`; this section's own
 * heading only labels the grid, in the same shape as the process rows heading.
 */
export function UseCases() {
  const { blockEyebrow, blockTitle, blockDescription, items } = siteContent.useCases;

  return (
    <section id="examples">
      <div className={`${GUTTER} pb-10 pt-16 sm:pt-[4.25rem]`}>
        <Reveal>
          <Eyebrow>{blockEyebrow}</Eyebrow>
        </Reveal>
        <Reveal
          as="h2"
          delay={80}
          className="mt-4 max-w-[45rem] text-balance text-[clamp(1.75rem,3.4vw,2rem)] font-light leading-[1.25] tracking-[-0.015em]"
        >
          {blockTitle}
        </Reveal>
        <Reveal as="p" delay={160} className="mt-4 max-w-[45rem] text-[1rem] leading-[1.6] text-muted-foreground">
          {blockDescription}
        </Reveal>
      </div>

      <div className="grid border-t border-border sm:grid-cols-2">
        {items.map((item, i) => (
          <Reveal
            key={item.tag}
            delay={i * 90}
            className={`group border-b border-border px-8 py-10 transition-colors duration-300 hover:bg-secondary sm:px-14 sm:py-[3.25rem] ${
              i % 2 === 0 ? "sm:border-r" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-6">
              <span className="rounded-full border border-accent px-3.5 py-1.5 font-display text-xs font-medium uppercase tracking-[0.1em] text-primary">
                {item.tag}
              </span>
              <Cube
                strokeWidth={1.2}
                className="h-[2.875rem] w-10 shrink-0 text-foreground/70 transition-transform duration-[350ms] ease-out group-hover:-translate-y-1"
              />
            </div>
            <h3 className="mt-[1.625rem] text-[1.5rem] font-semibold sm:text-[1.75rem]">
              {item.title}
            </h3>
            <p className="mt-3 max-w-[30rem] text-[0.9375rem] leading-[1.7] text-muted-foreground">
              {item.description}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
