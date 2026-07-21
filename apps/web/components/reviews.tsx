import Link from "next/link";
import { MessageSquare } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@nseluga/ui";
import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";

/** Decorative shimmer skeleton of a testimonial — signals "reviews live here soon". */
function QuoteSkeleton() {
  return (
    <div aria-hidden className="rounded-xl border border-border/60 bg-background/40 p-6">
      <div className="mb-4 size-8 rounded-md bg-secondary shimmer-surface animate-shimmer" />
      <div className="space-y-2.5">
        <div className="h-3 rounded bg-secondary shimmer-surface animate-shimmer" />
        <div className="h-3 w-11/12 rounded bg-secondary shimmer-surface animate-shimmer" />
        <div className="h-3 w-4/5 rounded bg-secondary shimmer-surface animate-shimmer" />
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div className="size-9 rounded-full bg-secondary shimmer-surface animate-shimmer" />
        <div className="h-3 w-1/3 rounded bg-secondary shimmer-surface animate-shimmer" />
      </div>
    </div>
  );
}

export function Reviews() {
  const { eyebrow, title, description, items, holdingState } = siteContent.reviews;

  return (
    <section id="reviews" className="border-t border-border/60 bg-secondary/70 pt-16 pb-24 sm:pt-20 sm:pb-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        {items.length === 0 ? (
          <div className="mt-14">
            {/* Placeholder testimonial cards — shimmer skeletons that read as
                "reviews will land here", staggered in on scroll. */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Reveal key={i} variant="pop" delay={i * 120} className={i === 2 ? "sm:col-span-2 lg:col-span-1" : ""}>
                  <QuoteSkeleton />
                </Reveal>
              ))}
            </div>

            <Reveal delay={200} className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-5 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_32px_hsl(var(--primary)/0.15)]">
                <MessageSquare className="size-7" aria-hidden />
              </div>
              <p className="text-xl font-semibold">{holdingState.title}</p>
              <p className="max-w-md text-base text-muted-foreground">{holdingState.body}</p>
              <Link
                href={holdingState.ctaHref}
                className="hover-glow animate-glow-pulse inline-flex items-center rounded-md bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground"
              >
                {holdingState.ctaLabel}
              </Link>
            </Reveal>
          </div>
        ) : (
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {items.map(({ quote, author, role, company }) => (
              <Card key={`${author}-${company}`} className="h-full">
                <CardHeader>
                  <CardDescription className="text-base leading-relaxed">&ldquo;{quote}&rdquo;</CardDescription>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-sm font-semibold">{author}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {role}, {company}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
