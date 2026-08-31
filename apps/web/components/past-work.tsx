import Image from "next/image";
import Link from "next/link";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER, CubeTexture } from "@/components/kit";
import { caseStudyImage } from "@/lib/case-study-images";

/**
 * Past work. The structure here is deliberately unchanged from production —
 * heading, then a two-column grid of screenshot-led case-study cards, with the
 * holding state as the empty case. Only the styling was brought over to the
 * shared design language: hairlines, light display type, the lift-card gesture.
 */
export function PastWork() {
  const { eyebrow, title, description, items, holdingState } = siteContent.pastWork;

  return (
    <section id="past-work" className="relative border-b border-border">
      <CubeTexture count={2} />
      <div className={`${GUTTER} pb-16 pt-16 sm:pt-[4.75rem]`}>
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
        <Reveal
          as="h1"
          delay={80}
          className="mt-5 text-balance text-[clamp(2.25rem,5vw,3.625rem)] font-light leading-[1.06] tracking-[-0.025em]"
        >
          {title}
        </Reveal>
        <Reveal as="p" delay={160} className="mt-5 max-w-xl text-[1.125rem] leading-relaxed text-muted-foreground">
          {description}
        </Reveal>

        {items.length === 0 ? (
          <Reveal className="mt-14 rounded-2xl border border-border bg-secondary px-8 py-16 text-center sm:px-16 sm:py-20">
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
          /* Two columns, not three: with exactly two items a 3-col grid leaves an
             orphaned empty cell on desktop. Revisit if a third case study lands. */
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {items.map((item, index) => {
              const shot = item.screenshots[0];
              return (
                <Reveal
                  as="div"
                  key={item.slug}
                  variant="pop"
                  delay={index * 110}
                  className="flex h-full flex-col"
                >
                  <Link
                    href={`/work/${item.slug}`}
                    className="group lift-card flex h-full flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {shot && (
                      /* The two client screenshots have opposite themes (DeLuca's is
                         light, L2's is dark). The inset hairline gives both the same
                         edge so the pair doesn't read as two different sites. */
                      <div className="relative aspect-[16/8] w-full shrink-0 overflow-hidden bg-secondary ring-1 ring-inset ring-border">
                        <Image
                          src={caseStudyImage(shot.src)}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 50vw, 100vw"
                          className="object-cover object-top"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-3 p-7">
                      <span className="w-fit rounded-full border border-accent px-3.5 py-1.5 font-display text-xs font-medium uppercase tracking-[0.1em] text-primary">
                        {item.tag}
                      </span>
                      <span className="text-[1.375rem] font-semibold">{item.title}</span>
                      <p className="text-[0.90625rem] leading-[1.7] text-muted-foreground">
                        {item.outcome}
                      </p>
                      <span className="mt-auto flex items-center gap-2 pt-2 font-display text-sm font-medium text-primary">
                        Read the case study
                        <span aria-hidden className="transition-transform duration-300 ease-out group-hover:translate-x-1.5">
                          &rarr;
                        </span>
                      </span>
                    </div>
                  </Link>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.link}
                    </a>
                  )}
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
