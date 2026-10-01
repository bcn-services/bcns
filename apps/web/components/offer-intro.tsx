import Link from "next/link";
import type { OfferItem } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { GUTTER } from "@/components/kit";

/**
 * Lead block for one offer on /services: heading, what it is, who it is for,
 * price, and a link to the contact form. Sits above that offer's existing
 * steps or grid, and owns the section's anchor id.
 */
export function OfferIntro({ offer }: { offer: OfferItem }) {
  const { id, title, description, audience, price, cta } = offer;
  return (
    <section id={id} className="scroll-mt-20 border-t border-border">
      <div className={`${GUTTER} grid gap-8 py-14 lg:grid-cols-[1fr_22rem] lg:gap-20`}>
        <div>
          <Reveal
            as="h2"
            className="text-balance text-[clamp(1.75rem,3.6vw,2.375rem)] font-light leading-[1.14] tracking-[-0.02em]"
          >
            {title}
          </Reveal>
          <Reveal as="p" delay={80} className="mt-4 max-w-[45rem] text-[1.0625rem] leading-relaxed">
            {description}
          </Reveal>
          <Reveal as="p" delay={140} className="mt-3 max-w-[45rem] text-[1rem] leading-relaxed text-muted-foreground">
            {audience}
          </Reveal>
        </div>
        <Reveal delay={200} className="lg:self-end">
          <p className="text-[1.375rem] font-semibold leading-snug tracking-[-0.01em] text-primary">{price}</p>
          <Link
            href="/#contact"
            className="lift-button mt-5 inline-block rounded-lg bg-primary px-[1.875rem] py-4 text-center text-[0.9375rem] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {cta}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
