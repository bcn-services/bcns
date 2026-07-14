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
    <section id="pricing" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map(({ name, price, description: tierDescription, features }, index) => (
            <Card key={index} className="h-full">
              <CardHeader>
                <CardTitle>{name}</CardTitle>
                <p className="text-2xl font-bold">{price}</p>
                <CardDescription>{tierDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="text-sm text-muted-foreground">
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
