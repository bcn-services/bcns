import Link from "next/link";
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
    <section id="past-work" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        {items.length === 0 ? (
          <div className="mt-14 flex flex-col items-center gap-6 text-center">
            <p className="text-xl font-semibold">{holdingState.title}</p>
            <p className="max-w-md text-base text-muted-foreground">{holdingState.body}</p>
            <Link
              href="/#contact"
              className="inline-flex items-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              {holdingState.ctaLabel}
            </Link>
          </div>
        ) : (
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ title: workTitle, outcome, link }, index) => (
              <Card key={index} className="h-full">
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
