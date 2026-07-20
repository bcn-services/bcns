import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, Container } from "@nseluga/ui";
import { siteContent } from "@/lib/content";

export function NavCards() {
  const { items } = siteContent.navCards;

  return (
    <section aria-label="Site navigation" className="pt-2 pb-16">
      <Container>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
          {items.map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                <Card className="h-full border-t-2 border-t-border transition-all duration-200 group-hover:border-t-primary group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/8 group-hover:-translate-y-0.5">
                  <CardContent className="flex h-full flex-col gap-3 p-6">
                    <span className="font-display text-lg font-semibold tracking-tight">
                      {card.title}
                    </span>
                    <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
                      {card.description}
                    </p>
                    <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-primary/70 transition-all duration-200 group-hover:text-primary group-hover:gap-2">
                      <span>Explore</span>
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                    </div>
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
