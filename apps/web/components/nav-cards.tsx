import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, Container } from "@bcns/ui";
import { siteContent } from "@/lib/content";

export function NavCards() {
  const { items } = siteContent.navCards;

  return (
    <section aria-label="Site navigation" className="pt-8 pb-16">
      <Container>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
          {items.map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                <Card className="h-full transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <CardContent className="flex h-full flex-col gap-3 p-6">
                    <span className="font-display text-lg font-semibold tracking-tight">
                      {card.title}
                    </span>
                    <p className="flex-1 text-sm text-muted-foreground">
                      {card.description}
                    </p>
                    <div className="mt-2 flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
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
