import Link from "next/link";
import { ArrowRight, Wrench, FolderOpen, Tag, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, Container } from "@nseluga/ui";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";

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
          {items.map((card, i) => {
            const Icon = NAV_CARD_ICONS[card.href] ?? Wrench;
            return (
              <Reveal as="li" key={card.href} variant="pop" delay={i * 110}>
                <Link href={card.href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                  <Card className="h-full overflow-hidden border-t-2 border-t-border transition-[transform,box-shadow,border-color] duration-300 ease-out group-hover:border-t-primary group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/20 group-hover:-translate-y-1.5 group-hover:scale-[1.02]">
                    <div className="relative flex items-center justify-center h-20 overflow-hidden bg-gradient-to-b from-primary/10 to-transparent">
                      {/* accent sweep on hover */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-px -translate-x-full bg-gradient-to-r from-transparent via-primary to-transparent transition-transform duration-500 ease-out group-hover:translate-x-full"
                      />
                      <Icon className="size-8 text-primary/60 transition-[transform,color] duration-300 ease-out group-hover:scale-110 group-hover:text-primary" aria-hidden />
                    </div>
                    <div className="flex flex-col gap-3 p-6 pt-4">
                      <span className="font-display text-lg font-semibold tracking-tight">
                        {card.title}
                      </span>
                      <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
                        {card.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary/70 transition-all duration-300 group-hover:text-primary group-hover:gap-2.5">
                        <span>Explore</span>
                        <ArrowRight className="size-4 link-slide" aria-hidden />
                      </div>
                    </div>
                  </Card>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
