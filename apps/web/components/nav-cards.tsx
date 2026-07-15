import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, Container } from "@bcns/ui";
import { siteContent } from "@/lib/content";

export function NavCards() {
  const { items } = siteContent.navCards;

  return (
    <section aria-label="Site navigation" className="py-16">
      <Container>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
          {items.map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <span className="font-display text-lg font-semibold tracking-tight">
                      {card.title}
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
