import Link from "next/link";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { GUTTER } from "@/components/kit";

/**
 * Site navigation as an editorial index: one full-width hairline row per
 * destination, flooding blue on hover. Replaces the old card grid — fewer
 * boxes, and the description gets room to actually be read.
 */
export function NavCards() {
  const { navCards } = siteContent;

  return (
    <nav aria-label="Sections" className="border-b border-border">
      <ul role="list">
        {navCards.items.map((card, i) => (
          <Reveal as="li" key={card.href} delay={i * 70}>
            <Link
              href={card.href}
              className={`group flood-row block focus-visible:outline-none ${
                i < navCards.items.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div
                className={`${GUTTER} grid items-center gap-3 py-8 sm:grid-cols-[23.75rem_1fr_3.75rem] sm:gap-12 sm:py-[2.375rem]`}
              >
                <span className="font-display text-[1.75rem] font-medium tracking-tight sm:text-[2.125rem]">
                  {card.title}
                </span>
                <span className="max-w-[38.75rem] text-[0.90625rem] leading-[1.6] text-muted-foreground transition-colors duration-[350ms] group-hover:text-accent-foreground group-focus-visible:text-accent-foreground">
                  {card.description}
                </span>
                <span aria-hidden className="flood-arrow hidden text-[1.5rem] sm:block sm:justify-self-end">
                  &rarr;
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </ul>
    </nav>
  );
}
