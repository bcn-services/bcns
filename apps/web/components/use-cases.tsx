import { CalendarClock, Boxes, LineChart, Wrench } from "lucide-react";
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

const useCaseIcons = [CalendarClock, Boxes, LineChart, Wrench] as const;

export function UseCases() {
  const { eyebrow, title, description, items } = siteContent.useCases;

  return (
    <section id="examples" className="border-t border-border/60 bg-muted/40 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ tag, title: caseTitle, description: caseDescription }, index) => {
            const Icon = useCaseIcons[index]!;
            return (
              <Card key={caseTitle} className="group h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform group-hover:-translate-y-0.5">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {tag}
                    </span>
                  </div>
                  <CardTitle className="mt-3 text-base">{caseTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">{caseDescription}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
