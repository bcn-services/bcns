import Link from "next/link";
import { ArrowRight, Wrench, FolderOpen, Tag, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, Container } from "@nseluga/ui";
import { siteContent } from "@/lib/content";

const NAV_CARD_ICONS: Record<string, LucideIcon> = {
  "/services": Wrench,
  "/work": FolderOpen,
  "/pricing": Tag,
  "/about": Users,
};

export function NavCards() {
  const { items } = siteContent.navCards;

  return (
    <section aria-label="Site navigation" className="pt-2 pb-16">
      <Container>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
          {items.map((card) => {
            const Icon = NAV_CARD_ICONS[card.href] ?? Wrench;
            return (
              <li key={card.href}>
                <Link href={card.href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                  <Card className="h-full overflow-hidden border-t-2 border-t-border transition-all duration-200 group-hover:border-t-primary group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/8 group-hover:-translate-y-0.5">
                    <div className="flex items-center justify-center h-20 bg-gradient-to-b from-primary/10 to-transparent">
                      <Icon className="size-8 text-primary/60 transition-colors duration-200 group-hover:text-primary" aria-hidden />
                    </div>
                    <div className="flex flex-col gap-3 p-6 pt-4">
                      <span className="font-display text-lg font-semibold tracking-tight">
                        {card.title}
                      </span>
                      <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
                        {card.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary/70 transition-all duration-200 group-hover:text-primary group-hover:gap-2">
                        <span>Explore</span>
                        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
