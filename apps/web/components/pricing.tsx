import Link from "next/link";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { GUTTER } from "@/components/kit";
import { CUBE_FACES, CUBE_OUTLINE, CUBE_VIEW_BOX } from "@/components/cube";

/**
 * The three tiers as open columns divided by hairlines (the prototype drops the
 * cards here). Each tier is one pillar: a single-colour cube, the "01 · Get
 * organized" eyebrow from `pillars`, the frozen tier name and price from
 * `pricing.tiers`, and a "Learn more" link to the service page.
 *
 * The section heading lives in the page's `PageHead`.
 */

/** One cube per pillar in its own face colour: 01 left, 02 right, 03 top. */
const CUBE_FILL = ["fill-cube-left", "fill-cube-right", "fill-cube-top"] as const;
/** Phase offsets so the three cubes don't bob in step. */
const BOB_DELAY = ["[animation-delay:0s]", "[animation-delay:-2.3s]", "[animation-delay:-4.6s]"] as const;

function PillarCube({ index }: { index: number }) {
  return (
    <svg
      viewBox={CUBE_VIEW_BOX}
      aria-hidden
      focusable="false"
      className={`h-[46px] w-11 animate-bob motion-reduce:animate-none ${BOB_DELAY[index] ?? ""}`}
    >
      {CUBE_FACES.map((d, i) => (
        <path key={i} d={d} className={CUBE_FILL[index] ?? "fill-cube-left"} />
      ))}
      <path d={CUBE_FACES[0]} className="fill-white opacity-25" />
      <path d={CUBE_FACES[2]} className="fill-black opacity-[0.14]" />
      <path
        d={CUBE_OUTLINE}
        fill="none"
        strokeWidth={2.4}
        strokeLinejoin="round"
        className="stroke-foreground/70"
      />
    </svg>
  );
}

/**
 * Splits a price string into its amount and its unit for the baseline pairing
 * ("$1,000" + "setup"). The string itself is never altered; the split is
 * presentational.
 */
function splitPrice(value: string): [string, string] {
  const at = value.indexOf(" ");
  return at === -1 ? [value, ""] : [value.slice(0, at), value.slice(at + 1)];
}

export function Pricing() {
  const { tiers } = siteContent.pricing;
  const { pillars } = siteContent;
  const { learnMore, disclaimer } = siteContent.pricingPage;

  return (
    <section id="pricing" aria-label={siteContent.pricing.eyebrow}>
      <div className={GUTTER}>
      <div className="grid border-t border-border min-[900px]:grid-cols-3">
        {tiers.map((tier, i) => {
          const pillar = pillars[i];
          // Consulting has no sub-price line; spacing stands in for it so the
          // three descriptions start on the same row.
          const isConsulting = tier.id === "consulting";
          const [amount, unit] = splitPrice(tier.setup ?? tier.price);
          return (
            <Reveal
              key={tier.name}
              as="article"
              variant="pop"
              delay={i * 110}
              className={`flex flex-col border-b border-border pb-12 pt-11 min-[900px]:border-b-0 min-[900px]:py-[3.25rem] ${
                i === 0
                  ? "min-[900px]:pr-10"
                  : "min-[900px]:border-l min-[900px]:px-10"
              }`}
            >
              <PillarCube index={i} />
              {pillar && (
                <p className="mt-6 font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary-ink">
                  {pillar.n} &middot; {pillar.label}
                </p>
              )}
              <h2 className="mt-2.5 font-display text-[1.625rem] font-medium leading-[1.2] tracking-[-0.015em]">
                {tier.name}
              </h2>

              <p className="mt-[1.625rem] flex items-baseline gap-2.5">
                <span className="font-display text-[3.25rem] font-light leading-none tracking-[-0.03em]">
                  {amount}
                </span>
                {unit && <span className="text-[0.9375rem] text-muted-foreground">{unit}</span>}
              </p>
              {tier.monthly && (
                <p className="mt-2.5 font-display text-[0.9375rem] font-medium text-primary-ink">{tier.monthly}</p>
              )}
              {tier.seats && (
                <p className="mt-2.5 font-display text-[0.9375rem] text-muted-foreground">{tier.seats}</p>
              )}

              <p
                className={`leading-[1.7] text-muted-foreground ${isConsulting ? "mt-[1.375rem] min-[900px]:mt-14" : "mt-[1.375rem]"}`}
              >
                {tier.description}
              </p>

              <ul className="mt-[1.625rem] grid gap-[0.8125rem] border-t border-border pt-6 text-[0.9375rem] leading-[1.55] text-muted-foreground">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <span aria-hidden className="mt-[0.5625rem] size-1.5 shrink-0 rounded-full bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              {pillar && (
                <Link
                  href={pillar.href}
                  className="group mt-auto inline-flex w-fit items-center gap-1.5 rounded-sm pt-8 font-display text-[0.9375rem] font-medium text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {learnMore[i]}
                  <span aria-hidden className="transition-transform duration-300 ease-out group-hover:translate-x-1.5">
                    &rarr;
                  </span>
                </Link>
              )}
            </Reveal>
          );
        })}
      </div>
      </div>

      <div className={`${GUTTER} pb-[4.5rem] pt-7`}>
        <p className="max-w-[44rem] text-sm leading-[1.7] text-muted-foreground">{disclaimer}</p>
      </div>
    </section>
  );
}
