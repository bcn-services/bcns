import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, Container } from "@bcns/ui";

const cards = [
  {
    label: "What we build",
    description: "How it works, delivery models, and example use cases.",
    href: "/services",
  },
  {
    label: "Past Work",
    description: "Projects we've shipped and what clients say about us.",
    href: "/work",
  },
  {
    label: "Pricing",
    description: "Transparent tiers with no hidden fees or long contracts.",
    href: "/pricing",
  },
] as const;

export function NavCards() {
  return (
    <section aria-label="Site navigation" className="py-16">
      <Container>
        <ul className="grid gap-4 sm:grid-cols-3" role="list">
          {cards.map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <span className="font-display text-lg font-semibold tracking-tight">
                      {card.label}
                    </span>
                    <p className="flex-1 text-sm text-muted-foreground">
                      {card.description}
                    </p>
                    <ArrowRight
                      className="size-4 text-primary transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
