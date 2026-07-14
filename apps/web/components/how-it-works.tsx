import { Search, Hammer, Rocket } from "lucide-react";
import { Container, SectionHeading } from "@bcns/ui";
import { siteContent } from "@/lib/content";

const stepIcons = [Search, Hammer, Rocket] as const;

export function HowItWorks() {
  const { eyebrow, title, description, items } = siteContent.howItWorks;

  return (
    <section id="how-it-works" className="border-t border-border/60 bg-muted/40 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <ol className="mt-14 grid gap-8 md:grid-cols-3">
          {items.map(({ step, title: stepTitle, description: stepDescription }, index) => {
            const Icon = stepIcons[index];
            if (!Icon) return null;
            return (
              <li key={index} className="relative flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-sm">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                    {step}
                  </span>
                </div>
                <h3 className="text-xl font-semibold">{stepTitle}</h3>
                <p className="text-pretty leading-relaxed text-muted-foreground">{stepDescription}</p>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
