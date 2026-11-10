import Image from "next/image";
import Link from "next/link";
import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { Reveal } from "@/components/reveal";
import { caseStudyImage } from "@/lib/case-study-images";
import { siteContent } from "@/lib/content";

/**
 * Home proof: one card per real build in `pastWork.items` (screenshot, who it
 * was for, what changed), each linking to its case study. The section head and
 * the link under the cards are `offYourPlate`.
 */
export function OffYourPlate() {
  const { offYourPlate, pastWork } = siteContent;

  return (
    <section id="off-your-plate" className="scroll-mt-20 border-y border-border">
      <div className={`${GUTTER} py-16 sm:py-[4.75rem]`}>
        <Reveal>
          <Eyebrow>{offYourPlate.eyebrow}</Eyebrow>
        </Reveal>
        <Reveal
          as="h2"
          delay={80}
          className="mt-[1.125rem] max-w-[40rem] text-balance text-[clamp(1.75rem,3.6vw,2.25rem)] font-light leading-[1.2] tracking-[-0.015em]"
        >
          {emphasize(offYourPlate.title, offYourPlate.emphasis)}
        </Reveal>
        <Reveal as="p" delay={160} className="mt-4 max-w-[34rem] text-pretty leading-[1.6] text-muted-foreground">
          {offYourPlate.description}
        </Reveal>

        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {pastWork.items.map((item, i) => {
            const shot = item.screenshots[0];
            return (
              <Reveal as="li" key={item.slug} delay={i * 110} className="flex">
                <Link
                  href={`/work/${item.slug}`}
                  className="lift-card group flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {shot && (
                    <Image
                      src={caseStudyImage(shot.src)}
                      alt={shot.alt}
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="block aspect-[16/10] h-auto w-full border-b border-border object-cover object-left-top"
                    />
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    <p className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary-ink">{item.tag}</p>
                    <h3 className="mt-2.5 text-[1.3125rem] font-semibold leading-snug">{item.title}</h3>
                    <p className="mt-3 flex-1 text-[0.9375rem] leading-[1.65] text-muted-foreground">{item.outcome}</p>
                    <p className="mt-5 font-display text-[0.9375rem] font-medium text-primary-ink">
                      {pastWork.readLabel}{" "}
                      <span aria-hidden className="inline-block transition-transform duration-300 ease-out group-hover:translate-x-1.5">
                        &rarr;
                      </span>
                    </p>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </ul>

        <Link
          href="/work"
          className="mt-9 inline-block rounded-lg border border-input px-7 py-3.5 text-[0.9375rem] font-medium transition-colors duration-200 hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {offYourPlate.allLabel}
        </Link>
      </div>
    </section>
  );
}
