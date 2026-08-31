import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { GUTTER } from "@/components/kit";

/**
 * The three tiers as hairline cards. Advanced carries the accent border and a
 * soft blue shadow so it reads as the recommended one; AI consulting sits on
 * the tint panel because it is a different kind of engagement, not a bigger one.
 *
 * The section heading lives in the page's `PageHead` — on the artboard the
 * pricing heading is the page head.
 */

/**
 * Splits a price string into its amount and its unit for the artboard's
 * baseline pairing ("$1,000" + "setup"). The string itself is never altered —
 * the split is presentational, the same trick `emphasize` uses on headlines.
 */
function splitPrice(value: string): [string, string] {
  const at = value.indexOf(" ");
  return at === -1 ? [value, ""] : [value.slice(0, at), value.slice(at + 1)];
}

export function Pricing() {
  const { tiers } = siteContent.pricing;

  return (
    <section id="pricing" className="border-b border-border">
      <div className={`${GUTTER} grid items-start gap-6 py-16 sm:py-16 lg:grid-cols-3`}>
        {tiers.map((tier, i) => {
          // Branch on data shape, not index: build tiers carry setup/monthly,
          // the consulting tier carries a single day rate.
          const isConsulting = !tier.setup;
          const [amount, unit] = splitPrice(tier.setup ?? tier.price);
          return (
            <Reveal
              key={tier.name}
              variant="pop"
              delay={i * 110}
              className={`lift-card h-full rounded-[1.125rem] border p-[2.125rem] ${
                isConsulting
                  ? "border-border bg-secondary"
                  : i === 1
                    ? "border-accent bg-card shadow-[0_12px_36px_hsl(var(--primary)/0.1)]"
                    : "border-border bg-card"
              }`}
            >
              <h3
                className={`font-display text-sm font-medium uppercase tracking-[0.08em] ${
                  i === 1 && !isConsulting ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {tier.name}
              </h3>

              <p className="mt-[1.125rem] flex items-baseline gap-2.5">
                <span className="text-[2.625rem] font-semibold tracking-[-0.02em]">{amount}</span>
                {unit && <span className="text-[0.9375rem] text-muted-foreground">{unit}</span>}
              </p>
              {tier.monthly && (
                <p className="mt-1 text-base font-semibold text-primary">{tier.monthly}</p>
              )}
              {tier.seats && <p className="mt-2 text-[0.8125rem] text-muted-foreground">{tier.seats}</p>}

              <p
                className={`text-[0.90625rem] leading-[1.65] text-muted-foreground ${
                  isConsulting ? "mt-[1.875rem]" : "mt-[1.125rem]"
                }`}
              >
                {tier.description}
              </p>

              <div aria-hidden className="my-[1.375rem] h-px bg-border" />

              <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <span aria-hidden className="mt-[0.4375rem] size-1.5 shrink-0 rotate-45 bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </Reveal>
          );
        })}
      </div>

      <p className={`${GUTTER} pb-16 text-center text-sm text-muted-foreground`}>
        Prices listed are standard starting price and are subject to change. We will provide a
        fixed quote for your product after our consult.
      </p>
    </section>
  );
}
