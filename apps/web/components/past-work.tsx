import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { Badge, Card, Container, SectionHeading } from "@nseluga/ui";
import { SectionAtmosphere } from "@/components/section-atmosphere";
import { Reveal } from "@/components/reveal";
import { SignatureMotif } from "@/components/signature-motif";
import { siteContent } from "@/lib/content";
import { caseStudyImage } from "@/lib/case-study-images";

export function PastWork() {
  const { eyebrow, title, description, items, holdingState } = siteContent.pastWork;

  return (
    <section id="past-work" className="relative overflow-hidden border-t border-border/60 pt-16 pb-16 sm:pt-20 sm:pb-20">
      <SectionAtmosphere variant="work" />
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        {items.length === 0 ? (
          <Reveal className="mx-auto mt-14 max-w-3xl">
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-secondary/40">
              {/* ambient glow from icon center */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_30%,hsl(var(--primary)/0.12),transparent_70%)]"
              />
              {/* branded motif, drifting low-opacity behind content — signals a live studio */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 opacity-[0.14] animate-drift"
              >
                <div className="scale-150">
                  <SignatureMotif />
                </div>
              </div>
              {/* subtle shimmer sweep across the panel — "live, awaiting first client" */}
              <div
                aria-hidden
                className="shimmer-surface animate-shimmer pointer-events-none absolute inset-0 opacity-60"
              />
              <div className="relative flex flex-col items-center gap-6 px-8 py-16 text-center sm:px-16 sm:py-20">
                <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_32px_hsl(var(--primary)/0.15)]">
                  <Clock className="size-8" aria-hidden />
                </div>
                <p className="text-xl font-semibold">{holdingState.title}</p>
                <p className="max-w-md text-base text-muted-foreground">{holdingState.body}</p>
                <Link
                  href={holdingState.ctaHref}
                  className="hover-glow animate-glow-pulse inline-flex items-center rounded-md bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground"
                >
                  {holdingState.ctaLabel}
                </Link>
              </div>
            </div>
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
                    className="group block flex-1 rounded-xl ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Card className="flex h-full flex-col overflow-hidden border-t-2 border-t-border transition-[transform,box-shadow,border-color] duration-300 ease-out group-hover:-translate-y-1.5 group-hover:scale-[1.02] group-hover:border-primary/40 group-hover:border-t-primary group-hover:shadow-xl group-hover:shadow-primary/20">
                      {shot && (
                        /* The two client screenshots have opposite themes (DeLuca's is
                           light, L2's is dark). The inset hairline gives both the same
                           edge so the pair doesn't read as two different sites. */
                        <div className="relative aspect-[16/8] w-full shrink-0 overflow-hidden bg-secondary/40 ring-1 ring-inset ring-border/60">
                          <Image
                            src={caseStudyImage(shot.src)}
                            alt=""
                            fill
                            sizes="(min-width: 640px) 50vw, 100vw"
                            className="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
                          />
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 top-0 h-px -translate-x-full bg-gradient-to-r from-transparent via-primary to-transparent transition-transform duration-500 ease-out group-hover:translate-x-full"
                          />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-3 p-6">
                        <Badge className="w-fit">{item.tag}</Badge>
                        <span className="font-display text-lg font-semibold tracking-tight">
                          {item.title}
                        </span>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {item.outcome}
                        </p>
                        <div className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium text-primary/70 transition-all duration-300 group-hover:gap-2.5 group-hover:text-primary">
                          <span>Read the case study</span>
                          <ArrowRight className="size-4 link-slide" aria-hidden />
                        </div>
                      </div>
                    </Card>
                  </Link>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block rounded-md text-sm text-muted-foreground underline underline-offset-4 ring-offset-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {item.link}
                    </a>
                  )}
                </Reveal>
              );
            })}
          </div>
        )}
      </Container>
    </section>
  );
}
