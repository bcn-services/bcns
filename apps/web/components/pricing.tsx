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
          {tiers.map(({ name, price, description: tierDescription, features }, index) => {
            const isConsulting = index === 2;
            return (
              <Card key={index} className={`h-full${isConsulting ? " border-primary/40 bg-primary/[0.04]" : ""}`}>
                <CardHeader>
                  {isConsulting && (
                    <div className="mb-3 flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Sparkles className="size-4" aria-hidden />
                    </div>
                  )}
                  <CardTitle>{name}</CardTitle>
                  <p className="text-2xl font-bold">{price}</p>
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
