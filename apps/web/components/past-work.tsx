import Link from "next/link";
import { Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@bcns/ui";
import { siteContent } from "@/lib/content";

export function PastWork() {
  const { eyebrow, title, description, items, holdingState } = siteContent.pastWork;

  return (
    <section id="past-work" className="border-t border-border/60 pt-16 pb-24 sm:pt-20 sm:pb-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        {items.length === 0 ? (
          <div className="mt-14 overflow-hidden rounded-2xl border border-border/60 bg-secondary/40">
            <div className="flex flex-col items-center gap-6 px-8 py-16 text-center sm:px-16 sm:py-20">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock className="size-6" aria-hidden />
              </div>
              <p className="text-xl font-semibold">{holdingState.title}</p>
              <p className="max-w-md text-base text-muted-foreground">{holdingState.body}</p>
              <Link
                href={holdingState.ctaHref}
                className="inline-flex items-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                {holdingState.ctaLabel}
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ title: workTitle, outcome, link }) => (
              <Card key={workTitle} className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">{workTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">{outcome}</CardDescription>
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {link}
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
