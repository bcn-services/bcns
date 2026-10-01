import Link from "next/link";

import { GUTTER } from "@/components/kit";
import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";

const BTN =
  "rounded-lg px-7 py-3.5 text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-accent";

/**
 * Closing CTA. `tone="plate"` is the prototype's `.cta-band`: the full-bleed
 * flood-blue plate with eyebrow, light headline, lead, a filled button, an
 * optional outline `secondary` button, and the three `highlights` columns
 * (the prototype shows them on the AI and Deluxe pages; other pages pass
 * `highlights={[]}`). In dark mode the button flips to the light fill so it
 * stays the loudest thing on the plate. `tone="quiet"` is the hairline row that
 * floods blue on hover. Copy comes from `contactSection`; the eyebrow, emphasis,
 * button label and highlights default to the shared content keys.
 */
export function CtaBand({
  title,
  description,
  tone = "quiet",
  eyebrow = siteContent.contactSection.eyebrow,
  emphasis = siteContent.servicesOverview.ctaEmphasis,
  cta = siteContent.hero.ctaPrimary,
  highlights = siteContent.contactSection.highlights,
  secondary,
}: {
  title: string;
  description: string;
  tone?: "quiet" | "plate";
  eyebrow?: string;
  emphasis?: string;
  cta?: string;
  highlights?: readonly { title: string; description: string }[];
  /** Outline button beside the primary one (plate tone only). External hrefs open with rel="noopener". */
  secondary?: { label: string; href: string };
}) {
  if (tone === "plate") {
    return (
      <section className="bg-accent text-accent-foreground dark:text-white">
        <div className={`${GUTTER} py-16 lg:py-[4.5rem]`}>
          <Reveal>
            <p className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] opacity-90">
              {eyebrow}
            </p>
          </Reveal>
          <Reveal
            as="h2"
            delay={80}
            className="mt-4 max-w-[18ch] text-balance font-display text-[clamp(2.25rem,5vw,3.5rem)] font-light leading-[1.05] tracking-[-0.02em] [&_b]:font-semibold"
          >
            {title.includes(emphasis) ? (
              <>
                {title.slice(0, title.indexOf(emphasis))}
                <b>{emphasis}</b>
                {title.slice(title.indexOf(emphasis) + emphasis.length)}
              </>
            ) : (
              title
            )}
          </Reveal>
          <Reveal as="p" delay={160} className="mt-4 max-w-[40rem] opacity-95">
            {description}
          </Reveal>
          <Reveal delay={240} className="mt-9 flex flex-wrap gap-3.5">
            <Link href="/#contact" className={`${BTN} lift-button bg-accent-foreground font-semibold text-primary-foreground`}>
              {cta}
            </Link>
            {secondary && (
              <a
                href={secondary.href}
                rel="noopener"
                className={`${BTN} border border-current bg-transparent font-medium transition-colors hover:bg-white/15`}
              >
                {secondary.label}
              </a>
            )}
          </Reveal>
          {highlights.length > 0 && (
            <Reveal delay={320} className="mt-10 grid gap-[22px] md:grid-cols-3 md:gap-8">
              {highlights.map((h) => (
                <div key={h.title} className="border-t border-current pt-3.5">
                  <b className="font-display text-[1.125rem] font-semibold">{h.title}</b>
                  <p className="mt-1.5 text-[0.9375rem] leading-[1.6] opacity-[.92]">{h.description}</p>
                </div>
              ))}
            </Reveal>
          )}
        </div>
      </section>
    );
  }
  return (
    <Link
      href="/#contact"
      className="flood-row group block border-b border-t border-border focus-visible:outline-none"
    >
      <div className={`${GUTTER} grid items-center gap-8 py-14 sm:grid-cols-[1fr_3.75rem] sm:py-[3.5rem]`}>
        <div>
          <p className="text-balance text-[clamp(1.75rem,3.4vw,2.5rem)] font-light tracking-[-0.02em]">
            {title}
          </p>
          <p className="mt-2.5 max-w-3xl text-[0.9375rem] leading-relaxed text-muted-foreground group-hover:text-accent-foreground">
            {description}
          </p>
        </div>
        <span
          aria-hidden
          className="flood-arrow hidden text-[1.75rem] sm:block sm:justify-self-end"
        >
          &rarr;
        </span>
      </div>
    </Link>
  );
}
