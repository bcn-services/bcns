import Link from "next/link";
import { AskHero } from "@/components/home/ask-hero";
import { GUTTER, emphasize } from "@/components/kit";
import { siteContent } from "@/lib/content";

/** Homepage hero: copy on the left, the "ask it anything" loop on the right (stacked on phones). */
export function Hero() {
  const { hero, askHero, tools } = siteContent;

  return (
    <section id="top" className={`${GUTTER} grid items-center gap-9 py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:py-[4.5rem]`}>
      <div>
        <p className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-[7px] font-display text-sm font-medium text-muted-foreground">
          <i className="size-2 flex-none rounded-full bg-primary" />
          {hero.badge}
        </p>
        <h1 className="mt-[22px] max-w-[12ch] text-balance text-[clamp(2.4rem,6vw,4rem)] font-light leading-[1.06] tracking-[-0.025em]">
          {emphasize(hero.headline, "ready for the future")}
        </h1>
        <p className="mt-[22px] max-w-[34rem] text-pretty text-[1.1875rem] leading-[1.6] text-muted-foreground">{hero.subheadline}</p>
        <div className="mt-8 flex flex-wrap gap-3.5">
          <Link
            href="/#contact"
            className="lift-button rounded-lg bg-primary-ink px-7 py-3.5 text-center text-[0.9375rem] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {hero.ctaPrimary}
          </Link>
          <Link
            href="#how"
            className="rounded-lg border border-input px-7 py-3.5 text-center text-[0.9375rem] font-medium transition-colors duration-200 hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {hero.ctaSecondary}
          </Link>
        </div>
      </div>
      <AskHero askHero={askHero} tools={tools} />
    </section>
  );
}
