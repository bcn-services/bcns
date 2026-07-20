import { Check, Sparkles } from "lucide-react";
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

export function Pricing() {
  const { eyebrow, title, description, tiers } = siteContent.pricing;

  return (
    <section id="pricing" className="border-t border-border/60 pt-16 pb-24 sm:pt-20 sm:pb-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map(({ name, price, setup, monthly, seats, description: tierDescription, features }, index) => {
            const isConsulting = index === 2;
            return (
              <Card key={index} className={`h-full${isConsulting ? " border-t-2 border-t-primary border-primary/30 bg-secondary/60" : ""}`}>
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
            );
          })}
        </div>
      </Container>
    </section>
  );
}
