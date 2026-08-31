import Link from "next/link";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER } from "@/components/kit";

/**
 * Reviews. Structure unchanged from production — heading, then either the
 * quote grid or the holding state. Restyled to the shared language: the empty
 * state is now a quiet tint panel rather than a shimmering skeleton grid,
 * because a placeholder that animates reads as louder than the real content
 * it stands in for.
 */
export function Reviews() {
  const { eyebrow, title, description, items, holdingState } = siteContent.reviews;

  return (
    <section id="reviews" className="border-b border-border bg-secondary">
      <div className={`${GUTTER} py-16 sm:py-[4.75rem]`}>
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
        <Reveal as="p" delay={160} className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
          {description}
        </Reveal>

        {items.length === 0 ? (
          <Reveal delay={220} className="mt-12 rounded-2xl border border-border bg-card px-8 py-14 text-center sm:px-16">
            <p className="text-xl font-semibold">{holdingState.title}</p>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">{holdingState.body}</p>
            <Link
              href={holdingState.ctaHref}
              className="lift-button mt-8 inline-block rounded-lg bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground"
            >
              {holdingState.ctaLabel}
            </Link>
          </Reveal>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
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
