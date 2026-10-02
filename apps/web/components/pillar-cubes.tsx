import Link from "next/link";
import { LogoCube } from "@/components/motion";
import { siteContent } from "@/lib/content";

/**
 * The /services overview figure: the logo cube that turns face-on and reveals
 * the three pillar cards (left-to-right = the cubes below them). All motion and
 * the hover/tap/Esc behaviour live in `LogoCube`; this only supplies the cards.
 */
export function PillarCubes() {
  const { pillars, servicesOverview } = siteContent;
  const cards = pillars.map((p) => (
    <Link
      key={p.href}
      href={p.href}
      className="group flex flex-col rounded-2xl border border-border bg-card px-6 pb-[1.375rem] pt-[1.625rem] transition-[border-color,box-shadow] duration-[350ms] hover:border-accent hover:shadow-[0_18px_44px_hsl(var(--primary)/0.14)] focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary-ink">
        {p.n} &middot; {p.label}
      </p>
      <h3 className="mt-2.5 font-display text-2xl font-semibold leading-tight tracking-[-0.01em]">{p.name}</h3>
      <p className="mt-2.5 flex-1 text-[0.9375rem] leading-[1.65] text-muted-foreground">{p.line}</p>
      <div className="mt-[1.125rem] flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 border-t border-border pt-3.5">
        <span className="font-display text-[0.9375rem] font-medium">{p.price}</span>
        <span className="text-[0.9375rem] font-semibold text-primary-ink">
          {servicesOverview.cardMore}{" "}
          <i aria-hidden className="inline-block not-italic transition-transform duration-300 ease-out group-hover:translate-x-1">
            &rarr;
          </i>
        </span>
      </div>
    </Link>
  ));
  return <LogoCube interactive cards={cards} ariaLabel={servicesOverview.cubeAriaLabel} />;
}
