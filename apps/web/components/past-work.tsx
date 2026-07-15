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
  const { eyebrow, title, description, items } = siteContent.pastWork;

  return (
    <section id="past-work" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

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
      </Container>
    </section>
  );
}
