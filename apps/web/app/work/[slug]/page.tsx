import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER, CubeTexture } from "@/components/kit";
import { siteContent, type PastWorkItem } from "@/lib/content";
import { caseStudyImage } from "@/lib/case-study-images";

interface CaseStudyPageProps {
  params: { slug: string };
}

/**
 * Single lookup used by all three exports below so slug resolution can never
 * drift between generateStaticParams, generateMetadata, and the page body.
 */
function getCaseStudy(slug: string): PastWorkItem | undefined {
  return siteContent.pastWork.items.find((item) => item.slug === slug);
}

export function generateStaticParams() {
  return siteContent.pastWork.items.map(({ slug }) => ({ slug }));
}

/**
 * The full param set is known at compile time from the registry, so there is no
 * legitimate on-demand render here — any unlisted slug is 404'd by the router
 * before a render is attempted. `notFound()` below still guards what does render.
 */
export const dynamicParams = false;

export function generateMetadata({ params }: CaseStudyPageProps): Metadata {
  const item = getCaseStudy(params.slug);
  if (!item) {
    // Benign fallback — the page body still 404s via notFound() below.
    return { title: siteContent.pageMeta.work.title };
  }
  return {
    title: item.title,
    description: item.outcome,
  };
}

export default function CaseStudyPage({ params }: CaseStudyPageProps) {
  const item = getCaseStudy(params.slug);
  if (!item) notFound();

  const { eyebrow, caseStudy } = siteContent.pastWork;

  // Keyed by a stable id, not by label text — labels are editable copy and
  // two of them colliding would silently collapse a section.
  const sections = [
    { id: "problem", label: caseStudy.problemLabel, text: item.problem },
    { id: "approach", label: caseStudy.approachLabel, text: item.approach },
    { id: "outcome", label: caseStudy.outcomeLabel, text: item.outcome },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative border-b border-border pb-16 pt-16 sm:pb-20 sm:pt-[4.75rem]">
          <CubeTexture count={2} />
          <div className={GUTTER}>
            <Link
              href="/work"
              className="group inline-flex items-center gap-1.5 rounded-sm font-display text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft
                className="size-4 transition-transform duration-200 ease-out group-hover:-translate-x-1"
                aria-hidden
              />
              {caseStudy.backLabel}
            </Link>

            {/* Two columns on desktop: the title holds a sticky left rail and
                the study runs down the right. A single centred column would
                leave the right half of a 90rem container empty, since the prose
                is capped near 68ch for readability and cannot fill it. */}
            <div className="mt-8 grid gap-12 lg:grid-cols-[24rem_1fr] lg:gap-20">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <Reveal>
                  <Eyebrow>{eyebrow}</Eyebrow>
                </Reveal>
                <Reveal
                  as="h1"
                  delay={80}
                  className="mt-4 text-balance text-[clamp(2.25rem,3.4vw,3rem)] font-light leading-[1.06] tracking-[-0.025em]"
                >
                  {item.title}
                </Reveal>
              </div>

              <div>
                <div className="max-w-[68ch] divide-y divide-border">
                  {sections.map(({ id, label, text }, index) => (
                    <Reveal
                      key={id}
                      as="div"
                      className={index === 0 ? "pb-8" : index === sections.length - 1 ? "pt-8" : "py-8"}
                    >
                      <h2 className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary">
                        {label}
                      </h2>
                      <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{text}</p>
                    </Reveal>
                  ))}
                </div>

                {/* Screenshots take the full right column rather than the prose
                    measure: they are dense UI captures, and the widest the
                    column gets is 52rem, still under the 896px ceiling the
                    1512px source files stay sharp at on a 2x display. The
                    `sizes` attribute must track this width or the browser
                    downloads a narrower variant and upscales it. */}
                {item.screenshots.length > 0 && (
                  <div className="mt-14 max-w-[52rem] space-y-10">
                    {item.screenshots.map((shot, index) => (
                      <Reveal as="figure" key={shot.src} delay={index * 120}>
                        <div className="rounded-2xl border border-border bg-card p-2 sm:p-3">
                          <Image
                            src={caseStudyImage(shot.src)}
                            alt={shot.alt}
                            sizes="(min-width: 1024px) 52rem, 100vw"
                            className="h-auto w-full rounded-lg"
                          />
                        </div>
                        <figcaption className="mt-3 text-sm text-muted-foreground">
                          {shot.caption}
                        </figcaption>
                      </Reveal>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
