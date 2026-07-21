import { Check, Sparkles } from "lucide-react";
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
import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";

export function Pricing() {
  const { eyebrow, title, description, tiers } = siteContent.pricing;

  return (
    <section id="pricing" className="relative overflow-hidden border-t border-border/60 pt-16 pb-24 sm:pt-20 sm:pb-28">
      <SectionAtmosphere variant="pricing" />
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          accent="monthly"
          description={description}
        />

        <div className="mt-14 grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map(({ name, price, setup, monthly, seats, description: tierDescription, features }, index) => {
            // Branch on data shape, not array position: build tiers carry
            // setup/monthly/seats; the consulting tier carries a single price.
            const isConsulting = !setup;
            const isAdvanced = !isConsulting && index === 1;
            // Featured Advanced tier: accent ring + elevated surface + glow so it
            // reads as the recommended tier before you reach the price (no new hue).
            const featuredClasses = isAdvanced
              ? " border-primary/50 bg-card shadow-xl shadow-primary/15 ring-2 ring-primary/50"
              : isConsulting
                ? " border-t-2 border-t-primary border-primary/30 bg-secondary/60"
                : "";
            return (
              <Reveal as="div" key={index} variant="pop" delay={index * 120} className="h-full">
                <Card className={`group hover-lift h-full${featuredClasses}`}>
                <CardHeader>
                  {isConsulting && (
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Sparkles className="size-4" aria-hidden />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary/70">Day rate</span>
                    </div>
                  )}
                  <CardTitle>{name}</CardTitle>
                  {isConsulting ? (
                    <p className="text-2xl font-bold">{price}</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-2xl font-bold">{setup}</p>
                      <p className="text-lg font-semibold text-foreground">{monthly}</p>
                      <p className="text-sm text-muted-foreground">{seats}</p>
                    </div>
                  )}
                  <CardDescription>{tierDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
