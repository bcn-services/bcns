import Image from "next/image";
import Link from "next/link";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { caseStudyImage } from "@/lib/case-study-images";

/**
 * Past work, as the prototype lays it out: a page head with the drifting tool
 * dots, then one hairline-separated case per item (text on one side, the
 * screenshot in a browser frame on the other, alternating), with the holding
 * state as the empty case. Each case is `item.tag` / title / problem, approach
 * and outcome from `pastWork`.
 */

/** Tool dot per case, by slug; an unlisted slug falls back to the brand blue. */
const CASE_DOT: Record<string, string> = {
  delucas: "bg-tool-quickbooks",
  l2detailz: "bg-tool-calendar",
};

/** The three dots on the head's hairline: tool colour, phase offset, resting position. */
const LANE_DOTS = [
  "bg-tool-shopify left-[20%] [animation-delay:0s]",
  "bg-tool-calendar left-[50%] [animation-delay:-3s]",
  "bg-tool-gmail left-[80%] [animation-delay:-6s]",
];

export function PastWork() {
  const { eyebrow, title, description, items, holdingState, caseStudy } = siteContent.pastWork;

  return (
    <>
      <section className={`${GUTTER} pb-14 pt-[4.5rem]`}>
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
        <Reveal
          as="h1"
          delay={80}
          className="mt-[1.125rem] text-balance text-[clamp(2.4rem,6vw,4rem)] font-light leading-[1.06] tracking-[-0.025em]"
        >
          {emphasize(title, "work")}
        </Reveal>
        <Reveal as="p" delay={160} className="mt-[1.375rem] max-w-[34rem] text-[1.1875rem] leading-relaxed text-muted-foreground">
          {description}
        </Reveal>
        {/* The one calm animation: three tool dots drift along a hairline. */}
        <div aria-hidden className="relative mt-14 h-px bg-border">
          {LANE_DOTS.map((dot) => (
            <i
              key={dot}
              className={`absolute -top-1 size-[9px] animate-drift rounded-full opacity-0 motion-reduce:animate-none motion-reduce:opacity-100 ${dot}`}
            />
          ))}
        </div>
      </section>

      <section id="past-work" aria-label={eyebrow} className={GUTTER}>
        {items.length === 0 ? (
          <Reveal className="mb-16 max-w-[34rem] border-t border-input pt-7">
            <p className="text-[1.375rem] font-medium leading-snug tracking-[-0.01em]">{holdingState.title}</p>
            <p className="mt-3.5 leading-[1.7] text-muted-foreground">{holdingState.body}</p>
            <Link
              href={holdingState.ctaHref}
              className="lift-button mt-7 inline-block rounded-lg bg-primary-ink px-7 py-3.5 text-[0.9375rem] font-semibold text-primary-foreground"
            >
              {holdingState.ctaLabel}
            </Link>
          </Reveal>
        ) : (
          items.map((item, index) => {
            const shot = item.screenshots[0];
            const flip = index % 2 === 1;
            const blocks = [
              { label: caseStudy.problemLabel, text: item.problem, out: false },
              { label: caseStudy.approachLabel, text: item.approach, out: false },
              { label: caseStudy.outcomeLabel, text: item.outcome, out: true },
            ];
            return (
              <article
                key={item.slug}
                id={item.slug}
                className="grid gap-9 border-t border-border py-14 first:border-t-0 lg:grid-cols-[5fr_6fr] lg:items-start lg:gap-[4.5rem] lg:py-[5.5rem]"
              >
                <Reveal className={flip ? "lg:order-2" : ""}>
                  <p className="flex items-center font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary-ink">
                    <span
                      aria-hidden
                      className={`mr-2.5 inline-block size-2 rounded-full ${CASE_DOT[item.slug] ?? "bg-primary"}`}
                    />
                    {item.tag}
                  </p>
                  <h2 className="mt-3.5 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-light leading-[1.12] tracking-[-0.02em]">
                    {item.title}
                  </h2>
                  <dl className="mt-9 grid gap-[1.625rem]">
                    {blocks.map(({ label, text, out }) => (
                      <div key={label}>
                        <dt className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {label}
                        </dt>
                        <dd
                          className={`mt-2 max-w-[34rem] leading-[1.7] ${
                            out
                              ? "border-l-2 border-primary pl-[1.125rem] text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {text}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <Link
                    href={`/work/${item.slug}`}
                    className="group mt-8 inline-flex items-center gap-2 rounded-sm font-display text-[0.9375rem] font-medium text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {caseStudy.readLabel}
                    <span aria-hidden className="transition-transform duration-300 ease-out group-hover:translate-x-1.5">
                      &rarr;
                    </span>
                  </Link>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block w-fit rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.link}
                    </a>
                  )}
                </Reveal>

                {shot && (
                  <Reveal variant="pop" delay={110} className={flip ? "lg:order-1" : ""}>
                    {/* Browser frame; the screenshot is a second, pointer-only route to the case study (the text link is the keyboard one). */}
                    <Link
                      href={`/work/${item.slug}`}
                      tabIndex={-1}
                      className="lift-card block overflow-hidden rounded-2xl border border-border bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex gap-[7px] border-b border-border px-4 py-[0.8125rem]">
                        <i className="size-[9px] rounded-full bg-input" />
                        <i className="size-[9px] rounded-full bg-input" />
                        <i className="size-[9px] rounded-full bg-input" />
                      </div>
                      <Image
                        src={caseStudyImage(shot.src)}
                        alt={shot.alt}
                        sizes="(min-width: 1024px) 50vw, 100vw"
                        className="block h-auto w-full"
                      />
                    </Link>
                  </Reveal>
                )}
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
