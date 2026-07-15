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

export function Reviews() {
  const { eyebrow, title, description, items, holdingState } = siteContent.reviews;

  return (
    <section id="reviews" className="border-t border-border/60 bg-secondary/70 py-24 sm:py-28">
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
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {items.map(({ quote, author, role, company }, index) => (
              <Card key={index} className="h-full">
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
