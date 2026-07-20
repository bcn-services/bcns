import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@nseluga/ui";
import { siteContent } from "@/lib/content";

export function Faq() {
  const { eyebrow, title, description, items } = siteContent.faq;

  return (
    <section id="faq" className="border-t border-border/60 bg-secondary/70 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {items.map(({ question, answer }, index) => (
            <Card key={index} className="h-full">
              <CardHeader>
                <CardTitle className="text-base">{question}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">{answer}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
