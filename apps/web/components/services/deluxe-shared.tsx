import type { ReactNode } from "react";

import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import type { PricingTier } from "@/lib/content";

/**
 * Pieces shared by /services/deluxe and /services/ai-consulting: the page head
 * with its action row, the hairline-topped section frame, the section heading,
 * the primary/outline buttons and the price block.
 */

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const BTN_PRIMARY = `lift-button inline-flex min-h-12 items-center rounded-lg bg-primary-ink px-7 py-3.5 text-[0.9375rem] font-semibold text-primary-foreground ${FOCUS}`;
export const BTN_OUTLINE = `inline-flex min-h-12 items-center rounded-lg border border-input px-7 py-3.5 text-[0.9375rem] font-medium transition-colors duration-200 hover:border-primary hover:bg-secondary ${FOCUS}`;

/** The standard subpage head (eyebrow, light headline, lede) plus a row of actions. */
export function HeadWithActions({
  eyebrow,
  title,
  emphasis,
  description,
  audience,
  maxWidth = "max-w-[22ch]",
  children,
}: {
  eyebrow: string;
  title: string;
  emphasis: string;
  description: string;
  audience: string;
  maxWidth?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`${GUTTER} flex flex-col items-start pb-6 pt-16`}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal
        as="h1"
        delay={80}
        className={`mt-[1.125rem] text-balance text-[clamp(2.4rem,6vw,4rem)] font-light leading-[1.06] tracking-[-0.025em] ${maxWidth}`}
      >
        {emphasize(title, emphasis)}
      </Reveal>
      <Reveal as="p" delay={160} className="mt-5 max-w-[34rem] text-[1.1875rem] leading-[1.6] text-muted-foreground">
        {description}
      </Reveal>
      <Reveal as="p" delay={200} className="mt-3 max-w-[34rem] text-[0.9375rem] font-medium leading-relaxed">
        {audience}
      </Reveal>
      {children && (
        <Reveal delay={240} className="mt-[1.875rem] flex flex-wrap items-center gap-x-[1.375rem] gap-y-3.5">
          {children}
        </Reveal>
      )}
    </div>
  );
}

/** A hairline-topped page section with the prototype's 72px / 104px rhythm. */
export function Section({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-border py-[4.5rem] lg:py-[6.5rem]">
      <div className={GUTTER}>{children}</div>
    </section>
  );
}

/** Eyebrow + light display heading (one emphasised phrase) opening a section. */
export function SectionHeading({
  eyebrow,
  title,
  emphasis,
  id,
}: {
  eyebrow: string;
  title: string;
  emphasis: string;
  id?: string;
}) {
  return (
    <>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal
        as="h2"
        id={id}
        delay={80}
        className="mb-10 mt-4 max-w-[26ch] text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]"
      >
        {emphasize(title, emphasis)}
      </Reveal>
    </>
  );
}

/** Pill tag used on the cards. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-border bg-secondary px-2.5 py-[3px] font-display text-xs font-medium uppercase tracking-[0.08em] text-primary-ink">
      {children}
    </span>
  );
}

/** "$5,000+ setup" -> ["$5,000+", "setup"]; the string itself is never altered. */
function splitPrice(value: string): [string, string] {
  const at = value.indexOf(" ");
  return at === -1 ? [value, ""] : [value.slice(0, at), value.slice(at + 1)];
}

/** Big price on the left, the tier's feature list as ticked hairline rows on the right. */
export function PriceBlock({ eyebrow, tier }: { eyebrow: string; tier: PricingTier }) {
  const [amount, unit] = splitPrice(tier.setup ?? tier.price);
  return (
    <div className="grid items-center gap-7 min-[900px]:grid-cols-2 min-[900px]:gap-[4.5rem]">
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <p className="mt-4 font-display text-[clamp(2.6rem,6vw,4.25rem)] font-light leading-[1.05] tracking-[-0.03em]">
          <b className="font-semibold text-primary">{amount}</b>
          {unit && ` ${unit}`}
        </p>
        {tier.monthly && (
          <p className="mt-2.5 font-display text-xl font-medium text-primary-ink">{tier.monthly}</p>
        )}
        <p className="mt-[1.125rem] max-w-[30rem] text-muted-foreground">{tier.description}</p>
      </Reveal>
      <Reveal delay={110} as="ul" className="grid">
        {tier.features.map((feature) => (
          <li
            key={feature}
            className="flex items-baseline gap-3.5 border-t border-border py-3.5 text-base last:border-b"
          >
            <span aria-hidden className="size-2 shrink-0 -translate-y-px rounded-full bg-primary" />
            {feature}
          </li>
        ))}
      </Reveal>
    </div>
  );
}
