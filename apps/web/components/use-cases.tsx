import { CalendarClock, Boxes, LineChart, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@nseluga/ui";
import { SectionAtmosphere } from "@/components/section-atmosphere";
import { siteContent } from "@/lib/content";

const useCaseIcons = [CalendarClock, Boxes, LineChart, Sparkles] as const;

export function UseCases() {
  const { eyebrow, title, description, items } = siteContent.useCases;

  return (
    <section id="examples" className="relative overflow-hidden border-t border-border/60 bg-secondary/70 pt-12 pb-16 sm:pt-16 sm:pb-20">
      <SectionAtmosphere variant="services" />
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ tag, title: caseTitle, description: caseDescription }, index) => {
            const Icon = useCaseIcons[index];
            if (!Icon) return null;
            const headerGradients = [
              "bg-gradient-to-br from-accent/70 to-transparent",
              "bg-gradient-to-bl from-accent/60 to-transparent",
              "bg-gradient-to-tr from-accent/60 to-transparent",
              "bg-gradient-to-b from-primary/18 to-transparent",
            ] as const;
            const iconColors = [
              "text-accent-foreground/80",
              "text-accent-foreground/80",
              "text-accent-foreground/80",
              "text-primary/70",
            ] as const;
            return (
              <Card key={index} className={`group h-full overflow-hidden transition-shadow hover:shadow-md${index === 3 ? " border-primary/30" : ""}`}>
                <div className={`relative flex items-center justify-center h-20 ${headerGradients[index]}`}>
                  <Icon className={`size-9 ${iconColors[index]} transition-colors duration-200 group-hover:text-primary`} aria-hidden />
                  <span className="absolute top-3 right-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {tag}
                  </span>
                </div>
                <CardHeader className="pt-4">
                  <CardTitle className="text-base lg:min-h-[2.75rem]">{caseTitle}</CardTitle>
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
