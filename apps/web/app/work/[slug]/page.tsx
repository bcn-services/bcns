import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, Container, SectionHeading } from "@nseluga/ui";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionAtmosphere } from "@/components/section-atmosphere";
import { Reveal } from "@/components/reveal";
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
        <section className="relative overflow-hidden border-t border-border/60 pt-16 pb-16 sm:pt-20 sm:pb-20">
          <SectionAtmosphere variant="work" />
          <Container>
            <Link
              href="/work"
              className="group inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft
                className="size-4 transition-transform duration-200 ease-out group-hover:-translate-x-1"
                aria-hidden
              />
              {caseStudy.backLabel}
            </Link>

            <SectionHeading as="h1" eyebrow={eyebrow} title={item.title} className="mt-8" />

            <div className="mx-auto mt-14 max-w-2xl divide-y divide-border/60">
              {sections.map(({ id, label, text }, index) => (
                <Reveal
                  key={id}
                  as="div"
                  className={index === 0 ? "pb-8" : index === sections.length - 1 ? "pt-8" : "py-8"}
                >
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">
                    {label}
                  </h2>
                  <p className="mt-3 text-lg text-muted-foreground">{text}</p>
                </Reveal>
              ))}
            </div>

            {/* Screenshots sit wider than the max-w-2xl prose column above: they
                are dense UI captures, and the source files are 1512px, so 896px
                is the largest display width that stays acceptably sharp at 2x
                DPR. The `sizes` attribute below must track this width, or the
                browser downloads a narrower variant and upscales it. */}
            {item.screenshots.length > 0 && (
              <div className="mx-auto mt-14 max-w-4xl space-y-10">
                {item.screenshots.map((shot, index) => (
                  <Reveal as="figure" key={shot.src} delay={index * 120}>
                    <Card className="p-2 sm:p-3">
                      <Image
                        src={caseStudyImage(shot.src)}
                        alt={shot.alt}
                        sizes="(min-width: 896px) 896px, 100vw"
                        className="h-auto w-full rounded-lg"
                      />
                    </Card>
                    <figcaption className="mt-3 text-center text-sm text-muted-foreground">
                      {shot.caption}
                    </figcaption>
                  </Reveal>
                ))}
              </div>
            )}
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
