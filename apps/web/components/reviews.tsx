import Link from "next/link";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER } from "@/components/kit";

/**
 * Reviews on the tint band: heading left, then either the quote grid or the
 * holding state (a hairline-topped note with an outline button) right.
 */
export function Reviews() {
  const { eyebrow, title, description, items, holdingState } = siteContent.reviews;

  return (
    <section id="reviews" className="border-t border-border bg-secondary">
      <div
        className={`${GUTTER} grid gap-10 pb-24 pt-[5.5rem] lg:grid-cols-[5fr_6fr] lg:items-start lg:gap-[4.5rem]`}
      >
        <div>
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            delay={80}
            className="mt-4 text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]"
          >
            {title}
          </Reveal>
          <Reveal as="p" delay={160} className="mt-[1.125rem] max-w-[30rem] text-[1.1875rem] leading-relaxed text-muted-foreground">
            {description}
          </Reveal>
        </div>

        {items.length === 0 ? (
          <Reveal delay={200} className="max-w-[34rem] border-t border-input pt-7">
            <h3 className="text-[1.375rem] font-medium leading-[1.3] tracking-[-0.01em]">{holdingState.title}</h3>
            <p className="mt-3.5 leading-[1.7] text-muted-foreground">{holdingState.body}</p>
            <Link
              href={holdingState.ctaHref}
              className="mt-7 inline-block rounded-lg border border-input px-7 py-3.5 text-[0.9375rem] font-medium transition-colors duration-200 hover:border-primary hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {holdingState.ctaLabel}
            </Link>
          </Reveal>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {items.map(({ quote, author, role, company }) => (
              <div
                key={`${author}-${company}`}
                className="lift-card h-full rounded-2xl border border-border bg-card p-8"
              >
                <p className="text-base leading-relaxed">&ldquo;{quote}&rdquo;</p>
                <p className="mt-6 text-sm font-semibold">{author}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {role}, {company}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
